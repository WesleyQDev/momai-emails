import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const { AccountManager } = require('../account-manager.ts')
const emailClient = require('../email-client.ts')
const policy = require('../imap-connection-policy.ts')

describe('imap-connection-policy classification', () => {
  it('classifies Gmail simultaneous-connection failures as quota', () => {
    expect(policy.classifyImapError(new Error('Too many simultaneous connections. (Failure)'))).toBe('quota')
    expect(policy.classifyImapError({ responseText: 'Too many simultaneous connections' })).toBe('quota')
    expect(policy.classifyImapError('Command failed: too many connections')).toBe('quota')
  })

  it('classifies DNS and socket failures as network, never as quota', () => {
    expect(policy.classifyImapError(Object.assign(new Error('getaddrinfo ENOTFOUND imap.gmail.com'), { code: 'ENOTFOUND' }))).toBe('network')
    expect(policy.classifyImapError(Object.assign(new Error('socket timed out'), { code: 'ETIMEDOUT' }))).toBe('network')
    expect(policy.classifyImapError(new Error('Network is unreachable'))).toBe('network')
  })

  it('backs off exponentially with a cap so retries probe only when the limit may be free', () => {
    const first = policy.computeQuotaCooldownMs(1)
    const second = policy.computeQuotaCooldownMs(2)
    const capped = policy.computeQuotaCooldownMs(50)
    expect(second).toBeGreaterThan(first)
    expect(capped).toBeLessThanOrEqual(policy.QUOTA_MAX_DELAY_MS + 5000)
  })
})

describe('AccountManager quota backoff and log throttle', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'momai-emails-quota-'))
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-23T18:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  it('skips background checks while quota cooldown is active and logs once', async () => {
    const manager = new AccountManager(tmpDir)
    const account = { id: 'acc_quota', email: 'quota@gmail.com' }
    ;(manager as any).accounts.set(account.id, account)
    ;(manager as any).lastSeenUids.set(account.id, 100)

    const origStatus = emailClient.getMailboxStatus
    const origFetch = emailClient.fetchMessages
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    emailClient.getMailboxStatus = vi.fn(async () => ({ ok: true, messages: 1, unseen: 1, uidNext: 101 }))
    emailClient.fetchMessages = vi.fn(async () => {
      throw new Error('Too many simultaneous connections. (Failure)')
    })

    try {
      await manager.checkAllAccountsForNewEmails()
      expect(emailClient.fetchMessages).toHaveBeenCalledTimes(1)
      const firstLogCalls = logSpy.mock.calls.length

      await manager.checkAllAccountsForNewEmails()
      expect(emailClient.fetchMessages).toHaveBeenCalledTimes(1)
      expect(logSpy.mock.calls.length).toBe(firstLogCalls)
    } finally {
      emailClient.getMailboxStatus = origStatus
      emailClient.fetchMessages = origFetch
      logSpy.mockRestore()
    }
  })

  it('does not apply quota cooldown to offline network failures', async () => {
    const manager = new AccountManager(tmpDir)
    const account = { id: 'acc_offline', email: 'offline@gmail.com' }
    ;(manager as any).accounts.set(account.id, account)
    ;(manager as any).lastSeenUids.set(account.id, 50)

    const origStatus = emailClient.getMailboxStatus
    const origFetch = emailClient.fetchMessages
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    emailClient.getMailboxStatus = vi.fn(async () => ({ ok: true, messages: 1, unseen: 0, uidNext: 51 }))
    emailClient.fetchMessages = vi.fn(async () => {
      throw Object.assign(new Error('getaddrinfo EAI_AGAIN imap.gmail.com'), { code: 'EAI_AGAIN' })
    })

    try {
      await manager.checkAllAccountsForNewEmails()
      await manager.checkAllAccountsForNewEmails()
      expect(emailClient.fetchMessages).toHaveBeenCalledTimes(2)
    } finally {
      emailClient.getMailboxStatus = origStatus
      emailClient.fetchMessages = origFetch
      logSpy.mockRestore()
    }
  })
})
