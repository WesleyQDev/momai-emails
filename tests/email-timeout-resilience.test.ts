import { describe, it, expect, vi } from 'vitest'
import {
  withTimeout,
  acquireMailboxLock,
  isMissingMailboxError,
  isRetryableFolderReadError
} from '../email-client.ts'

describe('IMAP timeout resilience & auto-reconnect', () => {
  it('withTimeout resolves immediately when promise finishes in time', async () => {
    const res = await withTimeout(Promise.resolve('ok'), 1000, 'timed out')
    expect(res).toBe('ok')
  })

  it('withTimeout rejects with custom error when promise hangs', async () => {
    const hanging = new Promise(() => {})
    await expect(withTimeout(hanging, 50, 'Operação expirou')).rejects.toThrow('Operação expirou')
  })

  it('acquireMailboxLock returns client and lock on healthy connection', async () => {
    const fakeLock = { release: vi.fn() }
    const fakeClient = {
      getMailboxLock: vi.fn(async () => fakeLock)
    }
    const fakeAccount = { id: 'acc_1', email: 'test@example.com' }

    const res = await acquireMailboxLock(fakeAccount, fakeClient, 'INBOX', 500)
    expect(res.client).toBe(fakeClient)
    expect(res.lock).toBe(fakeLock)
    expect(fakeClient.getMailboxLock).toHaveBeenCalledWith('INBOX')
  })

  it('acquireMailboxLock auto-recovers by reconnecting and retrying when pooled lock hangs', async () => {
    const staleLock = new Promise(() => {}) // hangs
    const staleClient = {
      getMailboxLock: vi.fn(() => staleLock)
    }

    const freshLock = { release: vi.fn() }
    const freshClient = {
      getMailboxLock: vi.fn(async () => freshLock)
    }

    const connectFnMock = vi.fn(async () => freshClient)
    const fakeAccount = { id: 'acc_stale', email: 'stale@example.com' }

    // Use short 60ms timeout to simulate dead socket
    const res = await acquireMailboxLock(fakeAccount, staleClient, 'INBOX', 60, connectFnMock)
    expect(connectFnMock).toHaveBeenCalledWith(fakeAccount)
    expect(res.client).toBe(freshClient)
    expect(res.lock).toBe(freshLock)
  })

  it('does not reconnect when the mailbox itself is missing', async () => {
    const missing = Object.assign(new Error('Unknown Mailbox: Archive'), { mailboxMissing: true })
    const staleClient = {
      getMailboxLock: vi.fn(async () => {
        throw missing
      })
    }
    const connectFnMock = vi.fn(async () => ({ getMailboxLock: vi.fn() }))
    const fakeAccount = { id: 'acc_missing', email: 'missing@example.com' }

    // Reconnecting cannot create a mailbox: the caller must report the real
    // cause instead of retrying forever or showing an empty folder.
    await expect(acquireMailboxLock(fakeAccount, staleClient, 'Archive', 500, connectFnMock)).rejects.toMatchObject({
      mailboxMissing: true,
      folder: 'Archive'
    })
    expect(connectFnMock).not.toHaveBeenCalled()
  })
})

describe('folder read retry policy', () => {
  it('retries a transient network failure once', () => {
    expect(isRetryableFolderReadError(new Error('Socket closed unexpectedly'))).toBe(true)
    expect(isRetryableFolderReadError(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))).toBe(true)
    expect(isRetryableFolderReadError(new Error('Timeout (25000ms) ao ler a pasta "INBOX" no IMAP'))).toBe(true)
  })

  it('never retries errors that cannot change by retrying', () => {
    expect(
      isRetryableFolderReadError(Object.assign(new Error('Unknown Mailbox: Archive'), { mailboxMissing: true }))
    ).toBe(false)
    expect(isRetryableFolderReadError(new Error('Too many simultaneous connections'))).toBe(false)
    expect(isRetryableFolderReadError(new Error('Authentication failed'))).toBe(false)
  })

  it('classifies a missing mailbox regardless of the wording', () => {
    expect(isMissingMailboxError(Object.assign(new Error('nope'), { mailboxMissing: true }))).toBe(true)
    expect(isMissingMailboxError(new Error('Unknown Mailbox: Spam (Failure)'))).toBe(true)
    expect(isMissingMailboxError(new Error('Socket closed'))).toBe(false)
    expect(isMissingMailboxError(null)).toBe(false)
  })
})
