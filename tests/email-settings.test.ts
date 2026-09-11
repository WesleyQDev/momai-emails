import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadEmailSettings,
  saveEmailSettings,
  DEFAULT_EMAIL_SETTINGS,
  type SettingsStore
} from '../src/services/settings'

const freshStore = (): SettingsStore => {
  const data = new Map<string, string>()
  return {
    getItem: (key) => (data.has(key) ? data.get(key) || null : null),
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    }
  }
}

let store: SettingsStore

beforeEach(() => {
  store = freshStore()
})

describe('email settings (concise gear menu)', () => {
  it('defaults to Primary-only notifications with category tabs visible', () => {
    expect(DEFAULT_EMAIL_SETTINGS).toEqual({
      notifyPrimaryOnly: true,
      showCategoryTabs: true,
      unreadWindowHours: 48,
      autoMarkRead: true
    })
  })

  it('loads defaults when nothing was saved yet', () => {
    expect(loadEmailSettings(store)).toEqual(DEFAULT_EMAIL_SETTINGS)
  })

  it('round-trips user choices through storage', () => {
    saveEmailSettings({ notifyPrimaryOnly: false, showCategoryTabs: false, unreadWindowHours: 24, autoMarkRead: false }, store)
    expect(loadEmailSettings(store)).toEqual({
      notifyPrimaryOnly: false,
      showCategoryTabs: false,
      unreadWindowHours: 24,
      autoMarkRead: false
    })
    saveEmailSettings({ ...DEFAULT_EMAIL_SETTINGS }, store)
    expect(loadEmailSettings(store)).toEqual(DEFAULT_EMAIL_SETTINGS)
  })

  it('keeps known values when the stored payload is partial or corrupt', () => {
    store.setItem('momai_emails_v1_settings', JSON.stringify({ notifyPrimaryOnly: false }))
    expect(loadEmailSettings(store)).toEqual({ ...DEFAULT_EMAIL_SETTINGS, notifyPrimaryOnly: false })
    store.setItem('momai_emails_v1_settings', JSON.stringify({ unreadWindowHours: 99 }))
    expect(loadEmailSettings(store).unreadWindowHours).toBe(48)
    store.setItem('momai_emails_v1_settings', 'not-json{{{')
    expect(loadEmailSettings(store)).toEqual(DEFAULT_EMAIL_SETTINGS)
  })
})
