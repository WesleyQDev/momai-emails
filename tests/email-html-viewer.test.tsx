import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('momai:sdk', () => ({ default: {} }))

describe('EmailHtmlViewer', () => {
  it('renders sandboxed iframe with sanitized HTML and external link target', async () => {
    const { EmailHtmlViewer } = await import('../src/components/EmailHtmlViewer')
    const testHtml = '<div class="job-card"><h1>Engenharia de Dados</h1><a href="https://indeed.com/job/123">Ver vaga</a><script>alert("hack")</script></div>'
    
    const markup = renderToStaticMarkup(createElement(EmailHtmlViewer, { html: testHtml }))

    // Iframe must be rendered with proper sandbox attributes
    expect(markup).toContain('<iframe')
    expect(markup).toContain('sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"')
    
    // Dangerous tags must be stripped
    expect(markup).not.toContain('alert("hack")')
    expect(markup).not.toContain('<script')

    // Safe email content and base target must be present in srcdoc
    expect(markup).toContain('Engenharia de Dados')
    expect(markup).toContain('https://indeed.com/job/123')
    expect(markup).toContain('Ver vaga')
    expect(markup).toContain('base target=&quot;_blank&quot;')
  })

  it('follows the theme canvas instead of a hardcoded white background', async () => {
    const { EmailHtmlViewer } = await import('../src/components/EmailHtmlViewer')
    const darkCanvas = { background: '#191919', foreground: '#e8e8e8', link: '#8ab4f8' }

    const markup = renderToStaticMarkup(createElement(EmailHtmlViewer, { html: '<p>Hi</p>', canvas: darkCanvas }))

    // Dark canvas is preserved while defaults are pre-mirrored for the inversion filter.
    expect(markup).toContain('#191919')
    expect(markup).toContain('invert(1) hue-rotate(180deg)')
    expect(markup).not.toContain('bg-white')
    expect(markup).toContain('bg-card')
  })

  it('inverts authored content on dark canvas so hardcoded text stays readable', async () => {
    const { EmailHtmlViewer } = await import('../src/components/EmailHtmlViewer')

    const darkMarkup = renderToStaticMarkup(
      createElement(EmailHtmlViewer, {
        html: '<p>Hi</p>',
        canvas: { background: '#191919', foreground: '#e8e8e8', link: '#8ab4f8' }
      })
    )
    expect(darkMarkup).toContain('invert(1) hue-rotate(180deg)')

    const lightMarkup = renderToStaticMarkup(
      createElement(EmailHtmlViewer, {
        html: '<p>Hi</p>',
        canvas: { background: '#ffffff', foreground: '#202124', link: '#1a73e8' }
      })
    )
    expect(lightMarkup).not.toContain('invert(1)')
  })

  it('keeps the reading body centered with capped width instead of stretching full width', async () => {
    const { EmailHtmlViewer } = await import('../src/components/EmailHtmlViewer')
    const testHtml = '<table width="600"><tr><td>Hello centered</td></tr></table>'

    const markup = renderToStaticMarkup(createElement(EmailHtmlViewer, { html: testHtml }))

    // Content must be wrapped in a centered reading shell
    expect(markup).toContain('email-shell')

    // Shell caps the width and centers (Gmail-style), instead of full-bleed
    expect(markup).toContain('640px !important')
    expect(markup).toContain('margin: 0 auto')

    // Email tables must keep their original width, never forced to full width
    // (the reading shell itself is fluid by design; only table/row rules matter here)
    expect(markup).not.toMatch(/table\s*\{[^}]*?(?<![-\w])width\s*:/)
    expect(markup).not.toMatch(/tbody,[^}]*?(?<![-\w])width\s*:/)
  })
})
