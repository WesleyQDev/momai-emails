import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('momai:sdk', () => ({ default: {} }))

describe('EmailReader spacing', () => {
  it('keeps the message card borders away from the panel side edges', async () => {
    const { EmailReader } = await import('../src/components/EmailReader')
    const email = {
      id: '1',
      uid: 1,
      messageId: 'm1',
      folder: 'INBOX',
      subject: 'Hello',
      from: { name: 'Ada', address: 'ada@example.com' },
      to: [{ name: 'Bob', address: 'bob@example.com' }],
      date: '2026-09-22',
      timestamp: Date.now(),
      read: true,
      starred: false,
      snippet: 'hi',
      text: 'hi there'
    }

    const markup = renderToStaticMarkup(
      createElement(EmailReader, {
        email,
        loading: false,
        onBack: () => {},
        onReply: () => {},
        onForward: () => {},
        onDelete: () => {},
        onMarkUnread: () => {},
        onQuickSendReply: async () => true
      })
    )

    // The reading pane must breathe: card borders away from the side edges.
    expect(markup).toContain('sm:px-10')

    // The plain-text message card must be narrowed and centered, not full width.
    expect(markup).toContain('max-w-[720px]')
  })

  it('narrows and centers the formatted message card instead of full width', async () => {
    const { EmailReader } = await import('../src/components/EmailReader')
    const email = {
      id: '2',
      uid: 2,
      messageId: 'm2',
      folder: 'INBOX',
      subject: 'Hello formatted',
      from: { name: 'Ada', address: 'ada@example.com' },
      to: [{ name: 'Bob', address: 'bob@example.com' }],
      date: '2026-09-22',
      timestamp: Date.now(),
      read: true,
      starred: false,
      snippet: 'hi',
      text: 'hi there',
      html: '<p>hi there</p>'
    }

    const markup = renderToStaticMarkup(
      createElement(EmailReader, {
        email,
        loading: false,
        onBack: () => {},
        onReply: () => {},
        onForward: () => {},
        onDelete: () => {},
        onMarkUnread: () => {},
        onQuickSendReply: async () => true
      })
    )

    expect(markup).toContain('max-w-[720px]')
    expect(markup).toContain('mx-auto')
  })
})
