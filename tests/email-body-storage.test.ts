import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { emailStorageCache, MAX_STORED_BODY_CHARS } from '../src/services/cache'
import type { EmailMessage } from '../src/services/types'

function createLocalStorageMock(quota = Number.POSITIVE_INFINITY) {
  const store = new Map<string, string>()
  const usedChars = () => Array.from(store.values()).reduce((total, value) => total + value.length, 0)
  return {
    get length() {
      return store.size
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      const next = String(value)
      const current = store.get(key)
      const delta = next.length - (current ? current.length : 0)
      if (usedChars() + delta > quota) {
        const error = new Error('QuotaExceededError')
        error.name = 'QuotaExceededError'
        throw error
      }
      store.set(key, next)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear()
  }
}

function makeEmail(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: '1',
    uid: 1,
    messageId: '<1@example.com>',
    folder: 'INBOX',
    subject: 'Subject',
    from: { name: 'Sender', address: 'sender@example.com' },
    to: [{ name: 'Me', address: 'me@example.com' }],
    date: new Date().toISOString(),
    timestamp: Date.now(),
    read: false,
    starred: false,
    snippet: '',
    ...overrides
  }
}

describe('persistent email body storage', () => {
  beforeEach(() => {
    globalThis.localStorage = createLocalStorageMock() as any
  })

  afterEach(() => {
    globalThis.localStorage = undefined as any
  })

  it('strips attachment payloads before persisting a body', () => {
    const email = makeEmail({
      text: 'hello',
      attachments: [
        {
          filename: 'doc.pdf',
          contentType: 'application/pdf',
          size: 10,
          base64Data: 'A'.repeat(1000),
          previewDataUrl: 'data:image/png;base64,BIG'
        },
        { filename: 'photo.png', contentType: 'image/png', size: 2 }
      ]
    })

    emailStorageCache.setEmailBody('acc_1', '1', email)
    const stored = emailStorageCache.getEmailBody('acc_1', '1')

    expect(stored?.text).toBe('hello')
    expect(stored?.attachments?.[0].filename).toBe('doc.pdf')
    expect(stored?.attachments?.[0].base64Data).toBeUndefined()
    expect(stored?.attachments?.[0].previewDataUrl).toBeUndefined()
    expect(stored?.attachments?.[1].filename).toBe('photo.png')
  })

  it('skips bodies that exceed the per-body storage budget', () => {
    const email = makeEmail({ text: 'x'.repeat(MAX_STORED_BODY_CHARS) })
    emailStorageCache.setEmailBody('acc_1', '1', email)
    expect(emailStorageCache.getEmailBody('acc_1', '1')).toBeNull()
  })

  it('evicts old bodies to make room when the quota is hit', () => {
    globalThis.localStorage = createLocalStorageMock(1200) as any

    emailStorageCache.setEmailBody('acc_1', 'a', makeEmail({ id: 'a', text: 'a'.repeat(500) }))
    emailStorageCache.setEmailBody('acc_1', 'b', makeEmail({ id: 'b', text: 'b'.repeat(500) }))

    expect(emailStorageCache.getEmailBody('acc_1', 'b')?.text?.length).toBe(500)
    expect(emailStorageCache.getEmailBody('acc_1', 'a')).toBeNull()
  })

  it('removes a single body entry without touching the others', () => {
    emailStorageCache.setEmailBody('acc_1', 'a', makeEmail({ id: 'a', text: 'body a' }))
    emailStorageCache.setEmailBody('acc_1', 'b', makeEmail({ id: 'b', text: 'body b' }))

    emailStorageCache.removeEmailBody('acc_1', 'a')

    expect(emailStorageCache.getEmailBody('acc_1', 'a')).toBeNull()
    expect(emailStorageCache.getEmailBody('acc_1', 'b')?.text).toBe('body b')
  })
})
