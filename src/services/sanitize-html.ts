// src/services/sanitize-html.ts
// Single sanitizer for untrusted e-mail HTML. Used by the reader (which also
// renders inside a sandboxed iframe) and by the composer before any draft or
// reply HTML is injected into the contentEditable editor.

import DOMPurify from 'dompurify'

export const EMAIL_SANITIZE_CONFIG = {
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

export function sanitizeEmailHtml(raw: string): string {
  if (!raw) return ''

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
      return purifyInstance.sanitize(raw, EMAIL_SANITIZE_CONFIG)
    }
  } catch {
    // Fallback if DOMPurify fails to initialize
  }

  // Safe basic fallback stripping scripts and iframes
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
}

/** Escapes a value before it is interpolated into an HTML attribute. */
export function escapeHtmlAttribute(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
