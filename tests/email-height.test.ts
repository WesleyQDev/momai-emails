import { describe, expect, it, vi } from 'vitest'

vi.mock('momai:sdk', () => ({ default: {} }))

describe('measureEmailContentHeight', () => {
  it('ignores the tall iframe viewport and measures content only', async () => {
    const { measureEmailContentHeight } = await import('../src/components/EmailHtmlViewer')

    // Short email (500px of content) inside a stale tall viewport (3000px):
    // the footer must sit right after the content, not after the viewport.
    const fakeDoc = {
      body: { scrollHeight: 500 },
      documentElement: { scrollHeight: 3000, offsetHeight: 3000 }
    } as unknown as Document

    expect(measureEmailContentHeight(fakeDoc)).toBe(520)
  })

  it('returns null when the document body is not available yet', async () => {
    const { measureEmailContentHeight } = await import('../src/components/EmailHtmlViewer')

    expect(measureEmailContentHeight(null)).toBeNull()
    expect(measureEmailContentHeight({} as Document)).toBeNull()
  })
})
