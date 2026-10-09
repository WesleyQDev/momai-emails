import { describe, expect, it, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const { AccountManager } = require('../account-manager.ts')

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

describe('AccountManager account resolution and notification prefs', () => {
  const tmpDirs: string[] = []

  function makeManager() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'momai-emails-strict-'))
    tmpDirs.push(dir)
    return new AccountManager(dir, { storage: memoryStorage() })
  }

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch {}
    }
  })

  it('does not fall back to another account when the explicit id is missing', () => {
    const manager = makeManager()
    manager.accounts.set('acc_a', { id: 'acc_a', email: 'a@example.com' })
    manager.activeAccountId = 'acc_a'

    expect(manager.getAccountForTool('acc_missing')).toBeNull()
    expect(manager.getAccountForTool('acc_a')?.id).toBe('acc_a')
    expect(manager.getAccountForTool()?.id).toBe('acc_a')
  })

  it('resolves an account by e-mail as documented in the tool contract', () => {
    const manager = makeManager()
    manager.accounts.set('acc_a', { id: 'acc_a', email: 'A@Example.com' })

    expect(manager.getAccountForTool('a@example.com')?.id).toBe('acc_a')
    expect(manager.getAccountForTool('someone@else.com')).toBeNull()
  })

  it('round-trips the native notifications switch', async () => {
    const manager = makeManager()
    expect((await manager.getNotificationPrefs()).notificationsEnabled).toBe(true)

    await manager.setNotificationPrefs({ notificationsEnabled: false })
    expect((await manager.getNotificationPrefs()).notificationsEnabled).toBe(false)

    await manager.setNotificationPrefs({ notificationsEnabled: true })
    expect((await manager.getNotificationPrefs()).notificationsEnabled).toBe(true)
  })
})
