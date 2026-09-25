import { describe, it, expect } from 'vitest'
import { isSentFolder } from '../src/services/folders'
import { formatSentRecipients, shouldShowRecipients } from '../src/services/recipients'

describe('sent folder detection (Gmail-style sent view)', () => {
  it('detects sent folders by role and by name', () => {
    expect(isSentFolder('Sent', 'sent')).toBe(true)
    expect(isSentFolder('Sent')).toBe(true)
    expect(isSentFolder('[Gmail]/Sent Mail')).toBe(true)
    expect(isSentFolder('Enviados')).toBe(true)
    expect(isSentFolder('[Gmail]/Enviados')).toBe(true)
    expect(isSentFolder('INBOX', 'inbox')).toBe(false)
    expect(isSentFolder('INBOX')).toBe(false)
    expect(isSentFolder('Spam', 'junk')).toBe(false)
  })
})

describe('sent recipients line (Para: name1, name2)', () => {
  it('prefers display names and falls back to the address', () => {
    expect(
      formatSentRecipients([
        { name: 'Marcos Queiroz', address: 'marcos@example.com' },
        { name: '', address: 'wesleydevel@example.com' }
      ])
    ).toBe('Marcos Queiroz, wesleydevel@example.com')
  })

  it('returns an empty string when there are no recipients', () => {
    expect(formatSentRecipients([])).toBe('')
    expect(formatSentRecipients(null as any)).toBe('')
  })

  it('joins several recipients without truncating the data', () => {
    expect(
      formatSentRecipients([
        { name: '', address: 'a@example.com' },
        { name: '', address: 'b@example.com' },
        { name: '', address: 'c@example.com' }
      ])
    ).toBe('a@example.com, b@example.com, c@example.com')
  })
})

describe('recipient column decision (Gmail: outgoing shows Para:)', () => {
  const folders = [
    { path: 'INBOX', name: 'INBOX', role: 'inbox', unreadCount: 0, totalCount: 0 },
    { path: 'Sent', name: 'Sent', role: 'sent', unreadCount: 0, totalCount: 0 },
    { path: 'Drafts', name: 'Drafts', role: 'drafts', unreadCount: 0, totalCount: 0 },
    { path: 'starred', name: 'starred', role: 'starred', unreadCount: 0, totalCount: 0 }
  ] as any
  const sentMsg = { folder: 'Sent' } as any
  const inboxMsg = { folder: 'INBOX' } as any
  const draftMsg = { folder: 'Trash', draft: true } as any

  it('shows recipients in Sent and Drafts, sender elsewhere', () => {
    expect(shouldShowRecipients('Sent', 'sent', sentMsg, folders)).toBe(true)
    expect(shouldShowRecipients('Drafts', 'drafts', sentMsg, folders)).toBe(true)
    expect(shouldShowRecipients('INBOX', 'inbox', inboxMsg, folders)).toBe(false)
    expect(shouldShowRecipients('Spam', 'junk', inboxMsg, folders)).toBe(false)
  })

  it('decides per message inside Starred', () => {
    expect(shouldShowRecipients('starred', 'starred', sentMsg, folders)).toBe(true)
    expect(shouldShowRecipients('starred', 'starred', draftMsg, folders)).toBe(true)
    expect(shouldShowRecipients('starred', 'starred', inboxMsg, folders)).toBe(false)
  })

  it('shows recipients in Trash as well', () => {
    expect(shouldShowRecipients('Trash', 'trash', inboxMsg, folders)).toBe(true)
    expect(shouldShowRecipients('[Gmail]/Lixeira', undefined, inboxMsg, folders)).toBe(true)
  })
})
