import { describe, it, expect, vi } from 'vitest'
import {
  withTimeout,
  acquireMailboxLock
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
})
