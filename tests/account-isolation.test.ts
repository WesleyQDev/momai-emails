import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { emailStorageCache } from '../src/services/cache'
import type { EmailMessage } from '../src/services/types'

describe('Multi-account cache isolation', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    globalThis.localStorage = {
      getItem: (key: string) => (store.has(key) ? store.get(key) || null : null),
      setItem: (key: string, value: string) => {
        store.set(key, String(value))
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => {
        store.clear()
      },
      key: (i: number) => Array.from(store.keys())[i] || null,
      length: store.size
    } as any
  })

  afterEach(() => {
    store.clear()
  })

  it('sanitizes and purges foreign account messages if present in storage cache', () => {
    const acc1Msg: EmailMessage = {
      id: '1',
      uid: 1,
      messageId: '<msg1@example.com>',
      accountId: 'acc_1',
      folder: 'INBOX',
      subject: 'Account 1 Email',
      from: { name: 'User 1', address: 'user1@example.com' },
      to: [{ name: 'Me', address: 'me@example.com' }],
      date: new Date().toISOString(),
      timestamp: Date.now(),
      read: false,
      starred: false,
      snippet: 'Hello from account 1'
    }

    const acc2Msg: EmailMessage = {
      id: '2',
      uid: 2,
      messageId: '<msg2@example.com>',
      accountId: 'acc_2',
      folder: 'INBOX',
      subject: 'Account 2 Email',
      from: { name: 'User 2', address: 'user2@example.com' },
      to: [{ name: 'Me', address: 'me@example.com' }],
      date: new Date().toISOString(),
      timestamp: Date.now(),
      read: false,
      starred: false,
      snippet: 'Hello from account 2'
    }

    // Directly simulate corrupted storage containing messages from both accounts
    globalThis.localStorage.setItem('momai_emails_v1_emails_acc_2_INBOX', JSON.stringify([acc1Msg, acc2Msg]))

    const result = emailStorageCache.getFolderEmails('acc_2', 'INBOX')
    expect(result).not.toBeNull()
    expect(result).toHaveLength(1)
    expect(result![0].id).toBe('2')
    expect(result![0].accountId).toBe('acc_2')
  })
})
