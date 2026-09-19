import { describe, it, expect } from 'vitest'
import {
  avatarKey,
  estimateDataUrlBytes,
  isOversizedAvatar,
  loadAvatar,
  saveAvatar,
  MAX_AVATAR_BYTES,
  type AvatarStore,
} from '../src/services/avatar-storage'

function freshStore(quotaBytes = 5_000_000): AvatarStore & { used: () => number } {
  const data = new Map<string, string>()
  let used = 0
  return {
    getItem: (key) => (data.has(key) ? data.get(key) ?? null : null),
    setItem: (key, value) => {
      const next = used - (data.get(key)?.length ?? 0) + value.length
      if (next > quotaBytes) {
        const err = new Error('Quota exceeded') as Error & { name: string }
        err.name = 'QuotaExceededError'
        throw err
      }
      data.set(key, value)
      used = next
    },
    removeItem: (key) => {
      used -= data.get(key)?.length ?? 0
      data.delete(key)
    },
    used: () => used,
  }
}

describe('avatar storage (custom profile photo persists across restarts)', () => {
  it('builds a stable key per account', () => {
    expect(avatarKey('acc_abc')).toBe('momai_emails_avatar_acc_abc')
  })

  it('rejects oversized photos so they never silently disappear', () => {
    const big = `data:image/jpeg;base64,${'A'.repeat(MAX_AVATAR_BYTES * 2)}`
    expect(isOversizedAvatar(big)).toBe(true)
    expect(estimateDataUrlBytes(big)).toBeGreaterThan(MAX_AVATAR_BYTES)
  })

  it('round-trips a small avatar through storage', () => {
    const store = freshStore()
    const small = `data:image/jpeg;base64,${'A'.repeat(10_000)}`
    expect(saveAvatar(store, 'acc_1', small)).toBe(true)
    expect(loadAvatar(store, 'acc_1')).toBe(small)
  })

  it('refuses to persist an oversized photo instead of losing it on reload', () => {
    const store = freshStore()
    const big = `data:image/jpeg;base64,${'A'.repeat(MAX_AVATAR_BYTES * 2)}`
    expect(saveAvatar(store, 'acc_1', big)).toBe(false)
    expect(loadAvatar(store, 'acc_1')).toBeNull()
  })

  it('rejects non-image payloads', () => {
    const store = freshStore()
    expect(saveAvatar(store, 'acc_1', 'not-a-data-url')).toBe(false)
    expect(loadAvatar(store, 'acc_1')).toBeNull()
  })
})
