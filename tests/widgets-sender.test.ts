import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/services/api', () => ({
  emailApi: {
    listEmails: vi.fn()
  }
}))

import { emailApi } from '../src/services/api'
import { fetchUnreadWidgetEmails, formatWidgetSender } from '../src/widgets/services/emailWidgets'

describe('widget sender formatting', () => {
  it('renders the sender name or address instead of [object Object]', () => {
    expect(formatWidgetSender({ name: 'Ana Ribeiro', address: 'ana@example.com' })).toBe('Ana Ribeiro')
    expect(formatWidgetSender({ name: '', address: 'ana@example.com' })).toBe('ana@example.com')
    expect(formatWidgetSender('raw@example.com')).toBe('raw@example.com')
    expect(formatWidgetSender(null)).toBe('Unknown')
  })
})

describe('fetchUnreadWidgetEmails', () => {
  it('honors the requested limit and reports the server total', async () => {
    const messages = Array.from({ length: 5 }, (_, index) => ({
      id: String(index + 1),
      from: { name: `Sender ${index + 1}`, address: `s${index + 1}@example.com` },
      subject: `Subject ${index + 1}`,
      snippet: 'preview',
      date: '2026-10-06T10:00:00.000Z'
    }))
    ;(emailApi.listEmails as any).mockResolvedValue({ ok: true, messages, total: 42 })

    const result = await fetchUnreadWidgetEmails('acc_1', 'INBOX', 3)

    expect(result.rows).toHaveLength(3)
    expect(result.total).toBe(42)
    expect(result.rows[0].from).toBe('Sender 1')
    expect(emailApi.listEmails).toHaveBeenCalledWith('INBOX', 'acc_1', 3, true, 0, false)
  })
})
