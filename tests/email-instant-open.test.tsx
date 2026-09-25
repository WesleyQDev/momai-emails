import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('momai:sdk', () => ({ default: {} }))

import { hasReadableBody } from '../src/services/email-content'

const listItem = {
  id: '9',
  uid: 9,
  messageId: 'm9',
  folder: 'INBOX',
  subject: 'Instant subject',
  from: { name: 'Ada', address: 'ada@example.com' },
  to: [{ name: 'Bob', address: 'bob@example.com' }],
  date: '2026-09-22',
  timestamp: Date.now(),
  read: false,
  starred: false,
  snippet: ''
}

const readerHandlers = {
  onBack: () => {},
  onReply: () => {},
  onForward: () => {},
  onDelete: () => {},
  onMarkUnread: () => {},
  onQuickSendReply: async () => true
} as any

describe('instant open (Gmail: click shows the message immediately)', () => {
  it('treats header-only list items as not yet readable', () => {
    expect(hasReadableBody(listItem as any)).toBe(false)
    expect(hasReadableBody({ ...listItem, text: 'hello' } as any)).toBe(true)
    expect(hasReadableBody({ ...listItem, html: '<p>hi</p>' } as any)).toBe(true)
    expect(hasReadableBody(null as any)).toBe(false)
  })

  it('renders the message header immediately while the body loads', async () => {
    const { EmailReader } = await import('../src/components/EmailReader')
    const markup = renderToStaticMarkup(
      createElement(EmailReader, { email: listItem, loading: true, ...readerHandlers })
    )
    expect(markup).toContain('Instant subject')
    expect(markup).toContain('Ada')
  })

  it('keeps a loading indicator when there is nothing to show yet', async () => {
    const { EmailReader } = await import('../src/components/EmailReader')
    const markup = renderToStaticMarkup(
      createElement(EmailReader, { email: null, loading: true, ...readerHandlers })
    )
    expect(markup).toContain('animate-spin')
  })
})
