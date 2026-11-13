import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const { AccountManager } = require('../account-manager.ts')
const emailClient = require('../email-client.ts')

describe('AccountManager primeAccount resilience', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'momai-emails-prime-'))
  })

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  it('establishes baseline from uidNext when fetchMessages fails', async () => {
    const manager = new AccountManager(tmpDir)
    const fakeAccount = { id: 'acc_test_1', email: 'test@example.com' }

    // Mock getMailboxStatus returning uidNext
    const origGetMailboxStatus = emailClient.getMailboxStatus
    const origFetchMessages = emailClient.fetchMessages

    emailClient.getMailboxStatus = vi.fn(async () => ({
      ok: true,
      messages: 10,
      unseen: 2,
      uidNext: 105
    }))

    // Simulate fetchMessages throwing "Command failed"
    emailClient.fetchMessages = vi.fn(async () => {
      throw new Error('Command failed')
    })

    try {
      await manager.primeAccount(fakeAccount.id, fakeAccount)
      // Should not throw, and should establish baseline 104 (uidNext - 1)
      expect(manager.lastSeenUids.get(fakeAccount.id)).toBe(104)
      expect(manager.unreadCounts.get(fakeAccount.id)).toBe(2)
    } finally {
      emailClient.getMailboxStatus = origGetMailboxStatus
      emailClient.fetchMessages = origFetchMessages
    }
  })

  it('sets fallback baseline 0 on catastrophic connection failure without throwing', async () => {
    const manager = new AccountManager(tmpDir)
    const fakeAccount = { id: 'acc_test_2', email: 'broken@example.com' }

    const origGetMailboxStatus = emailClient.getMailboxStatus
    const origFetchMessages = emailClient.fetchMessages

    emailClient.getMailboxStatus = vi.fn(async () => {
      throw new Error('Connection refused')
    })
    emailClient.fetchMessages = vi.fn(async () => {
      throw new Error('Connection refused')
    })

    try {
      await manager.primeAccount(fakeAccount.id, fakeAccount)
      expect(manager.lastSeenUids.get(fakeAccount.id)).toBe(0)
    } finally {
      emailClient.getMailboxStatus = origGetMailboxStatus
      emailClient.fetchMessages = origFetchMessages
    }
  })

  it('skips redundant 50-message fetch during primeAccount when STATUS already provides uidNext', async () => {
    const manager = new AccountManager(tmpDir)
    const fakeAccount = { id: 'acc_fast_prime', email: 'fast@example.com' }

    const origGetMailboxStatus = emailClient.getMailboxStatus
    const origFetchMessages = emailClient.fetchMessages

    emailClient.getMailboxStatus = vi.fn(async () => ({
      ok: true,
      messages: 42,
      unseen: 3,
      uidNext: 201
    }))
    const fetchSpy = vi.fn(async () => ({ messages: [], total: 0, hasMore: false }))
    emailClient.fetchMessages = fetchSpy

    try {
      await manager.primeAccount(fakeAccount.id, fakeAccount)
      expect(manager.lastSeenUids.get(fakeAccount.id)).toBe(200)
      expect(manager.unreadCounts.get(fakeAccount.id)).toBe(3)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      emailClient.getMailboxStatus = origGetMailboxStatus
      emailClient.fetchMessages = origFetchMessages
    }
  })

  it('emits onNewEmail immediately when foreground INBOX listing observes a newer UID', async () => {
    const manager = new AccountManager(tmpDir)
    const fakeAccount = { id: 'acc_fg', email: 'fg@example.com' }
    manager.accounts.set(fakeAccount.id, fakeAccount)
    manager.lastSeenUids.set(fakeAccount.id, 100)

    const events: any[] = []
    manager.setOnNewEmail((evt: any) => events.push(evt))

    await manager.observeFetchedInboxMessages(fakeAccount.id, [
      { id: '102', uid: 102, subject: 'Newest arrival', from: { name: 'Alice', address: 'alice@example.com' } },
      { id: '101', uid: 101, subject: 'First arrival', from: { name: 'Bob', address: 'bob@example.com' } },
      { id: '100', uid: 100, subject: 'Already seen', from: { name: 'Old', address: 'old@example.com' } }
    ])

    expect(manager.lastSeenUids.get(fakeAccount.id)).toBe(102)
    expect(events.map((e) => e.email.uid)).toEqual([101, 102])

    // Calling again with the same messages does not emit duplicate notifications
    await manager.observeFetchedInboxMessages(fakeAccount.id, [
      { id: '102', uid: 102, subject: 'Newest arrival', from: { name: 'Alice', address: 'alice@example.com' } }
    ])
    expect(events).toHaveLength(2)
  })
})
