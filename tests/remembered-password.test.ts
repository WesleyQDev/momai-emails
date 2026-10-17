import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const { AccountManager } = require('../account-manager.ts')
const emailClient = require('../email-client.ts')

function memoryStorage() {
  const map = new Map<string, any>()
  return {
    map,
    async get(key: string) {
      return map.has(key) ? map.get(key) : null
    },
    async set(key: string, value: any) {
      map.set(key, value)
    },
    async delete(key: string) {
      map.delete(key)
    }
  }
}

const originalEmailClient = {
  testAccountConnection: emailClient.testAccountConnection,
  getMailboxStatus: emailClient.getMailboxStatus,
  fetchMessages: emailClient.fetchMessages
}

describe('AccountManager remembered passwords', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'momai-emails-remember-'))
    // Keep account creation offline: accept the connection and let the UID
    // priming finish without touching the network.
    emailClient.testAccountConnection = async () => ({ ok: true })
    emailClient.getMailboxStatus = async () => ({ ok: false, error: 'offline in test' })
    emailClient.fetchMessages = async () => ({ messages: [] })
  })

  afterEach(() => {
    emailClient.testAccountConnection = originalEmailClient.testAccountConnection
    emailClient.getMailboxStatus = originalEmailClient.getMailboxStatus
    emailClient.fetchMessages = originalEmailClient.fetchMessages
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  it('stores the password when connecting with "remember password" enabled', async () => {
    const manager = new AccountManager(tmpDir, { storage: memoryStorage() })
    const res = await manager.addOrUpdateAccount({
      email: 'User@Gmail.com',
      password: 'abcd efgh ijkl mnop',
      rememberPassword: true
    })

    expect(res.ok).toBe(true)
    expect(manager.getRememberedPassword('user@gmail.com')).toBe('abcdefghijklmnop')
    expect(manager.getRememberedPassword(res.account.id)).toBe('abcdefghijklmnop')
  })

  it('never remembers a password when the option is not sent', async () => {
    const manager = new AccountManager(tmpDir, { storage: memoryStorage() })
    await manager.addOrUpdateAccount({ email: 'plain@example.com', password: 'secret123' })
    expect(manager.getRememberedPassword('plain@example.com')).toBeNull()
  })

  it('keeps the remembered password after the account is disconnected', async () => {
    const manager = new AccountManager(tmpDir, { storage: memoryStorage() })
    const res = await manager.addOrUpdateAccount({
      email: 'user@gmail.com',
      password: 'abcdefghijklmnop',
      rememberPassword: true
    })

    await manager.removeAccount(res.account.id)

    expect(manager.getAccountForTool(res.account.id)).toBeNull()
    expect(manager.getRememberedPassword('user@gmail.com')).toBe('abcdefghijklmnop')
  })

  it('forgets a previously remembered password when reconnecting with the option unchecked', async () => {
    const manager = new AccountManager(tmpDir, { storage: memoryStorage() })
    await manager.addOrUpdateAccount({
      email: 'user@gmail.com',
      password: 'abcdefghijklmnop',
      rememberPassword: true
    })
    expect(manager.getRememberedPassword('user@gmail.com')).toBe('abcdefghijklmnop')

    await manager.addOrUpdateAccount({
      email: 'user@gmail.com',
      password: 'newpassword123',
      rememberPassword: false
    })
    expect(manager.getRememberedPassword('user@gmail.com')).toBeNull()
  })

  it('forgets on demand without touching other entries', async () => {
    const manager = new AccountManager(tmpDir, { storage: memoryStorage() })
    await manager.rememberPassword('a@example.com', 'pass-a')
    await manager.rememberPassword('b@example.com', 'pass-b')

    await manager.forgetRememberedPassword('a@example.com')

    expect(manager.getRememberedPassword('a@example.com')).toBeNull()
    expect(manager.getRememberedPassword('b@example.com')).toBe('pass-b')
  })
})
