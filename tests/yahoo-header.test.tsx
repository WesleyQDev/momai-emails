import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('momai:sdk', () => ({ default: {} }))

describe('Yahoo header branding', () => {
  it('renders the official Yahoo Mail wordmark', async () => {
    const { YahooMailWordmark } = await import('../src/components/ProviderIcons')
    const markup = renderToStaticMarkup(createElement(YahooMailWordmark))
    expect(markup).toContain('0 0 140 25')
    expect(markup).toContain('#7D2EFF')
    expect(markup).toContain('height="22"')
  })

  it('shows only the wordmark for Yahoo accounts in the header', async () => {
    const { EmailsHeader } = await import('../src/components/EmailsHeader')
    const accounts = [
      {
        id: 'yahoo-1',
        name: 'Wesley',
        email: 'wesley@yahoo.com',
        provider: 'yahoo',
        imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
        smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
        createdAt: 0,
        updatedAt: 0,
        active: true,
        status: 'connected',
      },
    ] as any
    const markup = renderToStaticMarkup(
      createElement(EmailsHeader, {
        accounts,
        activeAccountId: 'yahoo-1',
        onSelectAccount: () => {},
        onOpenAddModal: () => {},
        onRemoveAccount: () => {},
        searchQuery: '',
        onSearchChange: () => {},
      } as any),
    )
    expect(markup).toContain('0 0 140 25')
    expect(markup).not.toContain('>Yahoo Mail<')
    expect(markup).not.toContain('#6001D2')
  })

  it('keeps the default provider icon and name for Gmail accounts', async () => {
    const { EmailsHeader } = await import('../src/components/EmailsHeader')
    const accounts = [
      {
        id: 'gmail-1',
        name: 'Wesley',
        email: 'wesley@gmail.com',
        provider: 'gmail',
        imap: { host: 'imap.gmail.com', port: 993, secure: true },
        smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
        createdAt: 0,
        updatedAt: 0,
        active: true,
        status: 'connected',
      },
    ] as any
    const markup = renderToStaticMarkup(
      createElement(EmailsHeader, {
        accounts,
        activeAccountId: 'gmail-1',
        onSelectAccount: () => {},
        onOpenAddModal: () => {},
        onRemoveAccount: () => {},
        searchQuery: '',
        onSearchChange: () => {},
      } as any),
    )
    expect(markup).toContain('Gmail')
    expect(markup).not.toContain('0 0 140 25')
  })
})
