import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('momai:sdk', () => ({ default: {} }))

describe('email dark-mode inversion', () => {
  it('detects when the canvas is dark enough to need inversion', async () => {
    const { emailCanvasNeedsInversion } = await import('../src/components/EmailHtmlViewer')

    expect(emailCanvasNeedsInversion('#191919')).toBe(true)
    expect(emailCanvasNeedsInversion('rgb(25, 25, 30)')).toBe(true)
    expect(emailCanvasNeedsInversion('#ffffff')).toBe(false)
    expect(emailCanvasNeedsInversion('rgb(255, 255, 255)')).toBe(false)
    expect(emailCanvasNeedsInversion('not-a-color')).toBe(false)
  })

  it('pre-inverts defaults so they land correctly after the shell filter', async () => {
    const { preInvertForInvertedShell, cssInversionResult, parseCssColor } = await import(
      '../src/components/EmailHtmlViewer'
    )

    // Round-trip: filter(pre-inverted(x)) must restore x (tolerance for rounding).
    for (const original of ['#e8e8e8', '#8ab4f8', 'rgb(232, 232, 232)', '#202124']) {
      const restored = parseCssColor(cssInversionResult(preInvertForInvertedShell(original, '#000000')))
      const expected = parseCssColor(original)
      expect(restored).not.toBeNull()
      expect(expected).not.toBeNull()
      for (const channel of ['r', 'g', 'b'] as const) {
        expect(Math.abs(restored![channel] - expected![channel])).toBeLessThanOrEqual(3)
      }
    }
  })

  it('leaves unparseable colors on the fallback instead of crashing', async () => {
    const { preInvertForInvertedShell } = await import('../src/components/EmailHtmlViewer')

    expect(preInvertForInvertedShell('not-a-color', '#202124')).toBe('#202124')
  })

  it('restores table-cell background images and tagged backgrounds in dark mode', async () => {
    const { EmailHtmlViewer } = await import('../src/components/EmailHtmlViewer')

    const darkMarkup = renderToStaticMarkup(
      createElement(EmailHtmlViewer, {
        html: '<p>Hi</p>',
        canvas: { background: '#191919', foreground: '#e8e8e8', link: '#8ab4f8' }
      })
    )

    // Legacy <td background="..."> heroes and JS-tagged backgrounds must be restored.
    expect(darkMarkup).toContain('[background]')
    expect(darkMarkup).toContain('data-email-bg')

    // Restored media nested inside a restored ancestor must not invert twice
    // (double inversion would flip the photos back to negatives).
    expect(darkMarkup).toContain('filter: none !important')
    expect(darkMarkup).toMatch(/:is\([^)]*\)\s+:is\([^)]*\)/)
  })

  it('tags only the outermost elements carrying their own background image', async () => {
    const { tagImageBackgrounds } = await import('../src/components/EmailHtmlViewer')

    const makeElement = (backgroundImage: string, insideRestored = false) => ({
      setAttribute: vi.fn(),
      closest: vi.fn(() => (insideRestored ? {} : null)),
      __backgroundImage: backgroundImage
    })
    const photoCell = makeElement('url("https://example.com/hero.jpg")')
    const plainCell = makeElement('none')
    const nestedCell = makeElement('url("https://example.com/nested.jpg")', true)
    const fakeDoc = {
      querySelectorAll: vi.fn(() => [photoCell, plainCell, nestedCell]),
      defaultView: {
        getComputedStyle: vi.fn((el: { __backgroundImage: string }) => ({
          backgroundImage: el.__backgroundImage
        }))
      }
    }

    const tagged = tagImageBackgrounds(fakeDoc as unknown as Document)

    expect(tagged).toBe(1)
    expect(photoCell.setAttribute).toHaveBeenCalledWith('data-email-bg', 'true')
    expect(plainCell.setAttribute).not.toHaveBeenCalled()
    expect(nestedCell.setAttribute).not.toHaveBeenCalled()
  })
})
