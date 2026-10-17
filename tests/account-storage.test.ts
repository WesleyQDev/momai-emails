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

  it('preserves avatar when account is removed so reconnecting restores the profile photo', async () => {
    const storage = memoryStorage()
    const manager = new AccountManager(tmpDir, { storage })
    const avatar = `data:image/jpeg;base64,${'A'.repeat(20_000)}`
    await manager.setAvatar('acc_1', avatar)
    expect(await manager.getAvatar('acc_1')).toBe(avatar)

    // Simulating account removal
    manager.accounts.set('acc_1', { id: 'acc_1', email: 'test@example.com' })
    await manager.removeAccount('acc_1')

    // Avatar must remain available for when account is reconnected
    expect(await manager.getAvatar('acc_1')).toBe(avatar)
  })

  it('automatically resolves and persists the original account avatar when connecting or querying an account', async () => {
    const { fetchAccountAvatar } = require('../account-manager.ts')
    const samplePng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )
    const mockFetch = async (url: string) => {
      if (url.includes('gravatar.com')) {
        return { ok: false, status: 404, headers: { get: () => 'text/plain' } }
      }
      if (url.includes('libravatar.org')) {
        return { ok: false, status: 404, headers: { get: () => 'text/plain' } }
      }
      if (url.includes('api.github.com/search/users')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ items: [] })
        }
      }
      if (url.includes('api.github.com/search/commits')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            items: [
              {
                commit: { author: { email: 'user@gmail.com' } },
                author: { type: 'User', avatar_url: 'https://avatars.githubusercontent.com/u/123?v=4' }
              }
            ]
          })
        }
      }
      if (url.includes('avatars.githubusercontent.com')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'image/png' },
          arrayBuffer: async () => samplePng.buffer.slice(samplePng.byteOffset, samplePng.byteOffset + samplePng.byteLength)
        }
      }
      return { ok: false, status: 404, headers: { get: () => 'text/plain' } }
    }

    const resolved = await fetchAccountAvatar('user@gmail.com', mockFetch as any)
    expect(resolved).toBe(`data:image/png;base64,${samplePng.toString('base64')}`)

    const storage = memoryStorage()
    const manager = new AccountManager(tmpDir, {
      storage,
      avatarFetcher: (email: string) => fetchAccountAvatar(email, mockFetch as any)
    })
    manager.accounts.set('acc_user', { id: 'acc_user', email: 'user@gmail.com', active: true })

    const fetched = await manager.getAvatar('acc_user')
    expect(fetched).toBe(resolved)
    expect(storage.map.get('avatar_acc_user')).toBe(resolved)
    expect(manager.getPublicAccounts()[0].avatar).toBe(resolved)
  })
})

