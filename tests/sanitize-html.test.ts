import { describe, expect, it } from 'vitest'
import { sanitizeEmailHtml, escapeHtmlAttribute } from '../src/services/sanitize-html'

describe('sanitizeEmailHtml', () => {
  it('removes scripts and iframes while keeping formatting content', () => {
    const dirty =
      '<div><style>.a{color:red}</style><b>Hi</b><img src="https://x/y.png"><script>alert(3)</script><iframe src="https://evil"></iframe></div>'

    const clean = sanitizeEmailHtml(dirty)

    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('<iframe')
    expect(clean).toContain('<b>Hi</b>')
    expect(clean).toContain('https://x/y.png')
  })

  it('returns an empty string for empty input', () => {
    expect(sanitizeEmailHtml('')).toBe('')
  })
})

describe('escapeHtmlAttribute', () => {
  it('neutralizes quotes and markup in interpolated attributes', () => {
    expect(escapeHtmlAttribute('x" onerror="alert(1)')).toBe('x&quot; onerror=&quot;alert(1)')
    expect(escapeHtmlAttribute('<b>&</b>')).toBe('&lt;b&gt;&amp;&lt;/b&gt;')
  })
})
