import { describe, it, expect } from 'vitest'
import { groupEmailsIntoThreads, getThreadMessagesForEmail, normalizeThreadSubject } from '../src/services/threads'
import type { EmailMessage } from '../src/services/types'

function makeMsg(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: '1',
    uid: 1,
    messageId: '<1@example.com>',
    folder: 'INBOX',
    subject: 'tatu kkkk',
    from: { name: 'Francisca', address: 'francisca@example.com' },
    to: [{ name: 'Me', address: 'me@example.com' }],
    date: '2026-11-13T06:55:00.000Z',
    timestamp: 1000,
    read: true,
    starred: false,
    snippet: 'oi',
    ...overrides
  }
}

describe('email thread grouping', () => {
  it('normalizes Re/Fwd/Res/Enc prefixes', () => {
    expect(normalizeThreadSubject('Re: tatu kkkk')).toBe('tatu kkkk')
    expect(normalizeThreadSubject('Re: Fwd: Res: tatu kkkk')).toBe('tatu kkkk')
  })

  it('groups replies from the same sender and subject into a single thread', () => {
    const msgs: EmailMessage[] = [
      makeMsg({ id: '3', uid: 3, messageId: '<3@example.com>', subject: 'Re: tatu kkkk', timestamp: 3000, read: false }),
      makeMsg({ id: '2', uid: 2, messageId: '<2@example.com>', subject: 'Re: tatu kkkk', timestamp: 2000, read: true }),
      makeMsg({ id: '1', uid: 1, messageId: '<1@example.com>', subject: 'tatu kkkk', timestamp: 1000, read: true })
    ]

    const threads = groupEmailsIntoThreads(msgs)
    expect(threads).toHaveLength(1)
    expect(threads[0].count).toBe(3)
    expect(threads[0].representative.id).toBe('3')
    expect(threads[0].representative.read).toBe(false)
    expect(threads[0].messages.map((m) => m.id)).toEqual(['1', '2', '3'])
  })

  it('groups messages linked by inReplyTo even if subject changed', () => {
    const msgs: EmailMessage[] = [
      makeMsg({ id: '1', uid: 1, messageId: '<orig@example.com>', subject: 'Assunto A', timestamp: 1000 }),
      makeMsg({ id: '2', uid: 2, messageId: '<rep@example.com>', inReplyTo: '<orig@example.com>', subject: 'Outro assunto', timestamp: 2000 })
    ]

    const threads = groupEmailsIntoThreads(msgs)
    expect(threads).toHaveLength(1)
    expect(threads[0].count).toBe(2)
  })

  it('does not merge unrelated messages from different senders with the same non-reply subject', () => {
    const msgs: EmailMessage[] = [
      makeMsg({ id: '1', uid: 1, from: { name: 'A', address: 'a@example.com' }, subject: 'Fatura', timestamp: 1000 }),
      makeMsg({ id: '2', uid: 2, from: { name: 'B', address: 'b@example.com' }, subject: 'Fatura', timestamp: 2000 })
    ]

    const threads = groupEmailsIntoThreads(msgs)
    expect(threads).toHaveLength(2)
  })

  it('returns all messages in the thread for a selected email', () => {
    const m1 = makeMsg({ id: '1', uid: 1, subject: 'tatu kkkk', timestamp: 1000 })
    const m2 = makeMsg({ id: '2', uid: 2, subject: 'Re: tatu kkkk', timestamp: 2000 })
    const m3 = makeMsg({ id: '3', uid: 3, subject: 'Outro', from: { name: 'Joao', address: 'joao@example.com' }, timestamp: 3000 })
    const thread = getThreadMessagesForEmail([m3, m2, m1], m2)
    expect(thread.map((m) => m.id)).toEqual(['1', '2'])
  })

  it('groups different subjects from the same sender into a single thread', () => {
    const msgs: EmailMessage[] = [
      makeMsg({ id: '1', uid: 1, from: { name: 'Procrack YT', address: 'procrack@example.com' }, subject: 'as', timestamp: 1000 }),
      makeMsg({ id: '2', uid: 2, from: { name: 'Procrack YT', address: 'procrack@example.com' }, subject: 'sfd', timestamp: 2000 }),
      makeMsg({ id: '3', uid: 3, from: { name: 'Procrack YT', address: 'procrack@example.com' }, subject: 'bigodão', timestamp: 3000 })
    ]

    const threads = groupEmailsIntoThreads(msgs)
    expect(threads).toHaveLength(1)
    expect(threads[0].count).toBe(3)
    expect(threads[0].representative.subject).toBe('bigodão')
    expect(threads[0].messages.map((m) => m.id)).toEqual(['1', '2', '3'])
  })

  it('keeps self-sent messages separate when selfAddress is excluded or groupBySender is false', () => {
    const msgs: EmailMessage[] = [
      makeMsg({
        id: '1',
        uid: 1,
        from: { name: 'Me', address: 'me@example.com' },
        to: [{ name: 'A', address: 'a@example.com' }],
        subject: 'Assunto 1',
        timestamp: 1000
      }),
      makeMsg({
        id: '2',
        uid: 2,
        from: { name: 'Me', address: 'me@example.com' },
        to: [{ name: 'B', address: 'b@example.com' }],
        subject: 'Assunto 2',
        timestamp: 2000
      })
    ]

    expect(groupEmailsIntoThreads(msgs, { selfAddress: 'me@example.com' })).toHaveLength(2)
    expect(groupEmailsIntoThreads(msgs, { groupBySender: false })).toHaveLength(2)
  })
})

