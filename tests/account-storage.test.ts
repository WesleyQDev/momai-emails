import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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

describe('AccountManager host storage migration', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'momai-emails-acct-'))
  })

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  it('persists notification prefs through injected host storage without touching JSON files', async () => {
    const storage = memoryStorage()
    const manager = new AccountManager(tmpDir, { storage })
    const prefs = await manager.setNotificationPrefs({ primaryOnly: false, unreadWindowHours: 24 })
    expect(prefs.primaryOnly).toBe(false)
    expect(storage.map.has('notify-prefs')).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'notify-prefs.json'))).toBe(false)
    expect(await manager.getNotificationPrefs()).toEqual(prefs)
  })

  it('imports legacy notify-prefs.json into host storage once', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'notify-prefs.json'),
      JSON.stringify({ primaryOnly: false, unreadWindowHours: 24 }),
      'utf8'
    )
    const storage = memoryStorage()
    const manager = new AccountManager(tmpDir, { storage })
    const prefs = await manager.getNotificationPrefs()
    expect(prefs.primaryOnly).toBe(false)
    expect(storage.map.has('notify-prefs')).toBe(true)
  })

  it('persists a custom avatar through host storage across restarts', async () => {
    const storage = memoryStorage()
    const manager = new AccountManager(tmpDir, { storage })
    const avatar = `data:image/jpeg;base64,${'A'.repeat(20_000)}`
    expect(await manager.setAvatar('acc_1', avatar)).toBe(true)
    expect(await manager.getAvatar('acc_1')).toBe(avatar)
    const fresh = new AccountManager(tmpDir, { storage })
    expect(await fresh.getAvatar('acc_1')).toBe(avatar)
    await fresh.removeAvatar('acc_1')
    expect(await fresh.getAvatar('acc_1')).toBeNull()
  })

  it('rejects oversized or non-image avatars instead of storing them', async () => {
    const storage = memoryStorage()
    const manager = new AccountManager(tmpDir, { storage })
    expect(await manager.setAvatar('acc_1', 'not-a-data-url')).toBe(false)
    expect(await manager.setAvatar('acc_1', `data:image/jpeg;base64,${'A'.repeat(1_500_000)}`)).toBe(false)
    expect(await manager.getAvatar('acc_1')).toBeNull()
  })
})
