// src/components/EmailHtmlViewer.tsx
// Sandboxed, CSS-isolated iframe renderer for HTML emails with full responsiveness, auto-height, and external link handling

import React, { useEffect, useRef, useState, useMemo } from 'react'
import DOMPurify from 'dompurify'

export const EMAIL_SHELL_MAX_WIDTH_PX = 640
export const EMAIL_HEIGHT_PADDING_PX = 20
export const EMAIL_HEIGHT_FALLBACK_PX = 300

interface MeasurableDocument {
  body?: { scrollHeight?: number } | null
}

/**
 * Measures the email content height from the body content only.
 * Viewport-driven sizes (documentElement/offsetHeight) are ignored on purpose:
 * they mirror the iframe element height, so including them feeds the measured
 * value back into the next resize and stretches the iframe forever,
 * pushing the footer an eternity down the page.
 */
export const measureEmailContentHeight = (doc: MeasurableDocument | null | undefined): number | null => {
  const contentHeight = doc?.body?.scrollHeight
  if (typeof contentHeight !== 'number' || contentHeight <= 0) {
    return null
  }
  return contentHeight + EMAIL_HEIGHT_PADDING_PX
}

interface EmailHtmlViewerProps {
  html: string
  className?: string
  /** Explicit canvas colors. When omitted, they are resolved from the active
      app theme tokens and fall back to the light canvas below. */
  canvas?: Partial<EmailCanvasTheme>
}

export interface EmailCanvasTheme {
  background: string
  foreground: string
  link: string
}

/** Light canvas fallback used only while the host theme cannot be resolved
    (server render, tests). The live view always prefers the active theme. */
export const LIGHT_CANVAS_FALLBACK: EmailCanvasTheme = {
  background: '#ffffff',
  foreground: '#202124',
  link: '#1a73e8'
}

/**
 * Elements treated as authored visual units inside the inverted shell: media
 * plus anything carrying its own image background (inline style, legacy
 * `background` attribute, or JS-tagged computed backgrounds). Their filter
 * restores the whole unit to its original colors at once.
 */
export const RESTORED_MEDIA_SELECTOR =
  'img, svg, video, canvas, picture, embed, object, [style*="background-image"], [background], [data-email-bg]'

interface BackgroundAwareDocument {
  querySelectorAll(selectors: string): ArrayLike<Element>
  defaultView?: { getComputedStyle(element: Element): { backgroundImage?: string | null } } | null
}

/**
 * Tags the outermost elements that paint their own background image, so the
 * inversion stylesheet can restore them (covers embedded-stylesheet and
 * shorthand backgrounds that no static selector can reach). Elements nested
 * inside an already restored unit are skipped to avoid double inversion.
 * Returns how many elements were tagged.
 */
export const tagImageBackgrounds = (doc: BackgroundAwareDocument | null | undefined): number => {
  const view = doc?.defaultView
  if (!doc || !view || typeof view.getComputedStyle !== 'function') return 0

  let tagged = 0
  const elements = Array.from(doc.querySelectorAll('*'))
  elements.forEach((candidate) => {
    try {
      if (typeof candidate.closest === 'function' && candidate.closest(RESTORED_MEDIA_SELECTOR)) return
      const backgroundImage = view.getComputedStyle(candidate).backgroundImage ?? ''
      if (backgroundImage && backgroundImage !== 'none') {
        candidate.setAttribute('data-email-bg', 'true')
        tagged += 1
      }
    } catch {
      // Ignore elements that cannot be inspected.
    }
  })
  return tagged
}

const isTransparentColor = (value: string): boolean => {
  const normalized = value.trim().toLowerCase()
  return normalized === '' || normalized === 'transparent' || normalized === 'rgba(0, 0, 0, 0)'
}

export interface RgbColor {
  r: number
  g: number
  b: number
}

export const parseCssColor = (value: string): RgbColor | null => {
  const normalized = value.trim().toLowerCase()

  const shortHex = /^#([0-9a-f]{3})$/.exec(normalized)
  if (shortHex) {
    const [r, g, b] = shortHex[1].split('').map((part) => parseInt(part + part, 16))
    return { r, g, b }
  }

  const longHex = /^#([0-9a-f]{6})$/.exec(normalized)
  if (longHex) {
    return {
      r: parseInt(longHex[1].slice(0, 2), 16),
      g: parseInt(longHex[1].slice(2, 4), 16),
      b: parseInt(longHex[1].slice(4, 6), 16)
    }
  }

  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/.exec(normalized)
  if (rgb) {
    const channels = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
    if (channels.every((part) => part >= 0 && part <= 255)) {
      return { r: channels[0], g: channels[1], b: channels[2] }
    }
    return null
  }

  if (normalized === 'black') return { r: 0, g: 0, b: 0 }
  if (normalized === 'white') return { r: 255, g: 255, b: 255 }
  return null
}

const relativeLuminance = ({ r, g, b }: RgbColor): number => {
  const channel = (value: number): number => {
    const s = value / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** True when the canvas is dark enough that authored dark-on-light emails need inversion. */
export const emailCanvasNeedsInversion = (background: string): boolean => {
  const color = parseCssColor(background)
  if (!color) return false
  return relativeLuminance(color) < 0.4
}

const rgbToHsl = ({ r, g, b }: RgbColor): [number, number, number] => {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  const lightness = (max + min) / 2

  if (delta === 0) return [0, 0, lightness]

  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  let hue = 0
  if (max === rn) hue = ((gn - bn) / delta) % 6
  else if (max === gn) hue = (bn - rn) / delta + 2
  else hue = (rn - gn) / delta + 4
  hue = ((hue * 60) % 360 + 360) % 360

  return [hue, saturation, lightness]
}

const hslToRgb = (hue: number, saturation: number, lightness: number): RgbColor => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const segment = hue / 60
  const x = chroma * (1 - Math.abs((segment % 2) - 1))
  const [rn, gn, bn] =
    segment < 1 ? [chroma, x, 0]
    : segment < 2 ? [x, chroma, 0]
    : segment < 3 ? [0, chroma, x]
    : segment < 4 ? [0, x, chroma]
    : segment < 5 ? [x, 0, chroma]
    : [chroma, 0, x]
  const lift = lightness - chroma / 2
  return {
    r: Math.round((rn + lift) * 255),
    g: Math.round((gn + lift) * 255),
    b: Math.round((bn + lift) * 255)
  }
}

const invertChannels = ({ r, g, b }: RgbColor): RgbColor => ({
  r: 255 - r,
  g: 255 - g,
  b: 255 - b
})

const rotateHue180 = (color: RgbColor): RgbColor => {
  const [hue, saturation, lightness] = rgbToHsl(color)
  return hslToRgb((hue + 180) % 360, saturation, lightness)
}

const toRgbString = ({ r, g, b }: RgbColor): string => `rgb(${r}, ${g}, ${b})`

/**
 * Simulates what `filter: invert(1) hue-rotate(180deg)` does to a color:
 * channel inversion first, then a 180-degree hue rotation.
 */
export const cssInversionResult = (value: string): string => {
  const color = parseCssColor(value)
  if (!color) return value
  return toRgbString(rotateHue180(invertChannels(color)))
}

/**
 * Pre-mirrors a default color so it lands correctly once the shell inversion
 * filter runs over it: filter(pre-inverted(x)) restores x. Order matters
 * (hue rotation first, then channel inversion), since the two steps do not
 * commute. Falls back to the given light default when unparseable.
 */
export const preInvertForInvertedShell = (value: string, fallback: string): string => {
  const color = parseCssColor(value)
  if (!color) return fallback
  return toRgbString(invertChannels(rotateHue180(color)))
}

const sanitizeHtmlContent = (raw: string): string => {
  if (!raw) return ''

  const sanitizeConfig = {
    WHOLE_DOCUMENT: false,
    ADD_TAGS: ['style', 'center'],
    ADD_ATTR: [
      'target',
      'align',
      'valign',
      'bgcolor',
      'border',
      'cellpadding',
      'cellspacing',
      'width',
      'height',
      'style',
      'color',
      'size',
      'face',
      'colspan',
      'rowspan',
      'class',
      'id'
    ],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'applet', 'form', 'base'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'formaction']
  }

  try {
    const rawPurify = DOMPurify as any
    const purifyInstance =
      typeof rawPurify?.sanitize === 'function'
        ? rawPurify
        : typeof rawPurify?.default?.sanitize === 'function'
          ? rawPurify.default
          : typeof rawPurify === 'function' && typeof window !== 'undefined'
            ? rawPurify(window)
            : null

    if (purifyInstance && typeof purifyInstance.sanitize === 'function') {
      return purifyInstance.sanitize(raw, sanitizeConfig)
    }
  } catch {
    // Fallback if DOMPurify fails to initialize
  }

  // Safe basic fallback stripping scripts and iframes
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
}

export const EmailHtmlViewer: React.FC<EmailHtmlViewerProps> = ({ html, className = '', canvas: canvasOverride }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>(EMAIL_HEIGHT_FALLBACK_PX)
  const [resolvedCanvas, setResolvedCanvas] = useState<EmailCanvasTheme | null>(null)

  // 1. Sanitize the HTML payload safely preserving email styling and attributes
  const sanitizedHtml = useMemo(() => {
    return sanitizeHtmlContent(html)
  }, [html])

  // 2. Resolve the canvas colors from the active app theme tokens, so the
  // isolated email document follows light/dark themes instead of a hard white.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const probe = probeRef.current
    if (!probe) return

    const readThemeCanvas = (): EmailCanvasTheme | null => {
      try {
        const style = window.getComputedStyle(probe)
        const background = style.backgroundColor
        const foreground = style.color
        const linkEl = probe.querySelector('[data-canvas-link]')
        const link = linkEl ? window.getComputedStyle(linkEl).color : ''
        if (isTransparentColor(background) || isTransparentColor(foreground)) return null
        return {
          background,
          foreground,
          link: isTransparentColor(link) ? LIGHT_CANVAS_FALLBACK.link : link
        }
      } catch {
        return null
      }
    }

    const applyThemeCanvas = () => {
      const next = readThemeCanvas()
      if (!next) return
      setResolvedCanvas((prev) =>
        prev &&
        prev.background === next.background &&
        prev.foreground === next.foreground &&
        prev.link === next.link
          ? prev
          : next
      )
    }

    applyThemeCanvas()
    const observer =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(applyThemeCanvas)
        : null
    observer?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme']
    })
    return () => observer?.disconnect()
  }, [])

  const canvas: EmailCanvasTheme = useMemo(
    () => ({
      ...LIGHT_CANVAS_FALLBACK,
      ...resolvedCanvas,
      ...canvasOverride
    }),
    [resolvedCanvas, canvasOverride]
  )

  // 3. Build full HTML document with isolation styling, responsive rules, and base target
  const fullDocument = useMemo(() => {
    // Dark canvas: authored emails assume a light canvas (hardcoded dark text
    // on transparent background), so the content shell is inverted to keep the
    // contrast — and our own defaults are pre-mirrored to land correctly.
    const inverted = emailCanvasNeedsInversion(canvas.background)
    const bodyColor = inverted
      ? preInvertForInvertedShell(canvas.foreground, LIGHT_CANVAS_FALLBACK.foreground)
      : canvas.foreground
    const linkColor = inverted
      ? preInvertForInvertedShell(canvas.link, LIGHT_CANVAS_FALLBACK.link)
      : canvas.link
    const inversionCss = inverted
      ? [
          '/* Dark canvas: invert authored light emails so hardcoded dark text stays readable. */',
          '.email-shell {',
          '  filter: invert(1) hue-rotate(180deg);',
          '}',
          '/* Media and image backgrounds are inverted back so photos, heroes and logos keep their colors. */',
          `${RESTORED_MEDIA_SELECTOR} {`,
          '  filter: invert(1) hue-rotate(180deg) !important;',
          '}',
          '/* Filters compose down the tree: a restored ancestor already flips its',
          '   whole subtree back, so restored media nested inside it must not invert',
          '   a second time (that would turn the photos into negatives again). */',
          `.email-shell :is(${RESTORED_MEDIA_SELECTOR}) :is(${RESTORED_MEDIA_SELECTOR}) {`,
          '  filter: none !important;',
          '}'
        ].join('\n')
      : ''

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <base target="_blank" />
  <style>
    :root {
      color-scheme: light dark;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html {
      width: 100%;
      max-width: 100%;
      overflow-x: auto;
      overflow-y: hidden;
      -webkit-text-size-adjust: 100%;
      text-size-adjust: 100%;
    }
    body {
      margin: 0;
      padding: 16px;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      overflow-x: auto;
      overflow-y: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: ${bodyColor};
      background-color: ${canvas.background};
      word-break: break-word;
      overflow-wrap: break-word;
    }
    /* Responsive layout constraints for email tables and containers.
       Only cap overflow, never force full width, so fixed-width emails keep their design. */
    table {
      border-collapse: collapse;
      max-width: 100% !important;
      table-layout: auto !important;
    }
    table[align="center"] {
      margin-left: auto !important;
      margin-right: auto !important;
    }
    tbody, thead, tfoot, tr {
      max-width: 100% !important;
    }
    td, th {
      max-width: 100% !important;
      word-break: break-word !important;
      overflow-wrap: anywhere !important;
    }
    td[nowrap], th[nowrap] {
      white-space: normal !important;
    }
    img, svg, video, embed, object {
      max-width: 100% !important;
      height: auto !important;
      display: inline-block;
    }
    div, p, center, section, article, header, footer {
      max-width: 100% !important;
      box-sizing: border-box !important;
    }
    /* Centered reading column (Gmail-style): fluid on small windows, capped and
       centered on large screens. Declared after the generic rules with
       !important so they cannot override the cap. */
    body > .email-shell {
      width: 100% !important;
      max-width: ${EMAIL_SHELL_MAX_WIDTH_PX}px !important;
      margin: 0 auto !important;
      min-width: 0;
      overflow-wrap: break-word;
    }
    [style*="width"] {
      max-width: 100% !important;
    }
    [width] {
      max-width: 100% !important;
    }
    a {
      color: ${linkColor};
      cursor: pointer;
    }
    ${inversionCss}
    /* Scrollbar styling */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.15);
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <div class="email-shell">
    ${sanitizedHtml}
  </div>
</body>
</html>`
  }, [sanitizedHtml, canvas])

  // 3. Reset the height for each new message so a tall previous email never
  // leaves a huge blank behind for a shorter one.
  useEffect(() => {
    setHeight(EMAIL_HEIGHT_FALLBACK_PX)
  }, [fullDocument])

  // 4. Attach click delegation, window resize handling, and auto-height listener
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    let resizeObserver: ResizeObserver | null = null

    const recalculateHeight = () => {
      try {
        const next = measureEmailContentHeight(iframe.contentDocument)
        if (next !== null) {
          // Ignore sub-pixel jitter so a resize never feeds itself.
          setHeight((prev) => (Math.abs(next - prev) < 2 ? prev : next))
        }
      } catch {
        // Ignore cross-origin / document access errors
      }
    }

    const handleIframeSetup = () => {
      try {
        const doc = iframe.contentDocument
        if (!doc) return

        // Click interceptor for all links & buttons inside email
        const handleClick = (e: MouseEvent) => {
          const anchor = (e.target as HTMLElement | null)?.closest('a')
          if (anchor) {
            const href = anchor.getAttribute('href')
            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
              e.preventDefault()
              e.stopPropagation()
              window.open(anchor.href, '_blank', 'noopener,noreferrer')
            }
          }
        }

        doc.addEventListener('click', handleClick, true)

        recalculateHeight()

        // Tag computed image backgrounds (table heroes, shorthand styles) so
        // the inversion stylesheet restores them instead of leaving negatives.
        if (emailCanvasNeedsInversion(canvas.background)) {
          tagImageBackgrounds(doc)
        }

        // Observe content size changes (images, responsive reflows).
        // Only the body is observed: the root element mirrors the iframe
        // viewport height, so observing it feeds our own height back
        // into the next measurement and stretches the page forever.
        if (typeof ResizeObserver !== 'undefined' && doc.body) {
          resizeObserver = new ResizeObserver(() => {
            recalculateHeight()
          })
          resizeObserver.observe(doc.body)
        }

        // Also recalculate when images load
        const images = doc.querySelectorAll('img')
        images.forEach((img) => {
          if (!img.complete) {
            img.addEventListener('load', recalculateHeight, { once: true })
            img.addEventListener('error', recalculateHeight, { once: true })
          }
        })

        // Outer window resizes change the iframe width, so the content
        // reflows and the height is remeasured. The iframe's own viewport
        // resizes are ignored on purpose (see above).
      } catch {
        // Fallback gracefully
      }
    }

    iframe.addEventListener('load', handleIframeSetup)
    window.addEventListener('resize', recalculateHeight)

    return () => {
      iframe.removeEventListener('load', handleIframeSetup)
      window.removeEventListener('resize', recalculateHeight)
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
    }
  }, [fullDocument])

  return (
    <div className={`w-full max-w-[720px] mx-auto rounded-xl border border-border/60 bg-card shadow-xs overflow-hidden ${className}`}>
      {/* Hidden probe resolving the active theme tokens for the isolated email document. */}
      <div
        ref={probeRef}
        aria-hidden="true"
        className="bg-card text-text"
        style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      >
        <a data-canvas-link className="text-accent" />
      </div>
      <iframe
        ref={iframeRef}
        srcDoc={fullDocument}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        title="Email content"
        className="w-full max-w-full border-0 block"
        style={{
          height: `${height}px`,
          minHeight: '180px',
          backgroundColor: canvas.background
        }}
      />
    </div>
  )
}
