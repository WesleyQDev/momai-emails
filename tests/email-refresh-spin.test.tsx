import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('momai:sdk', () => ({ default: {} }))

const message = {
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

const baseProps = {
  messages: [message],
  activeFolder: 'INBOX',
  selectedEmailId: null,
  searchQuery: '',
  onSearchChange: () => {},
  onRefresh: () => {},
  onSelectEmail: () => {},
  onToggleStarred: () => {},
  onMarkRead: () => {},
  onMarkUnread: () => {},
  onDelete: () => {},
  onBatchDelete: () => {},
  onBatchMarkRead: () => {}
} as any

describe('refresh button spin (manual clicks only)', () => {
  it('does not animate during automatic background loads', async () => {
    const { EmailList } = await import('../src/components/EmailList')
    const markup = renderToStaticMarkup(createElement(EmailList, { ...baseProps, loading: true }))
    expect(markup).not.toContain('animate-spin')
  })

  it('stays static when idle', async () => {
    const { EmailList } = await import('../src/components/EmailList')
    const markup = renderToStaticMarkup(createElement(EmailList, { ...baseProps, loading: false }))
    expect(markup).not.toContain('animate-spin')
  })

  it('stays clickable while background fills the list', async () => {
    const { EmailList } = await import('../src/components/EmailList')
    // Manual refresh cancels background fills (new request generation
    // discards stale results), so it must never lock while loading.
    // The refresh button is identified by its localized title (pt-BR default
    // in tests).
    const refreshTag = (markup: string) => markup.match(/<button[^>]*title="Atualizar pasta"[^>]*>/)?.[0] ?? ''
    const busy = renderToStaticMarkup(
      createElement(EmailList, { ...baseProps, loading: true, loadingMore: true, hasMore: true })
    )
    const idle = renderToStaticMarkup(
      createElement(EmailList, { ...baseProps, loading: false, loadingMore: false })
    )
    expect(refreshTag(busy)).toContain('title=')
    expect(refreshTag(busy)).not.toContain('disabled')
    expect(refreshTag(idle)).not.toContain('disabled')
  })
})
