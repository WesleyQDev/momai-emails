// src/services/settings.ts
// Concise user preferences behind the header gear page. Stored in localStorage
// next to the other UI caches; the notifier and window choices are also pushed
// to the background worker so badges keep working while the page is closed.

export type UnreadWindowHours = 24 | 48

export interface EmailSettings {
  notifyPrimaryOnly: boolean
  showCategoryTabs: boolean
  unreadWindowHours: UnreadWindowHours
  autoMarkRead: boolean
}

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  notifyPrimaryOnly: true,
  showCategoryTabs: true,
  unreadWindowHours: 48,
  autoMarkRead: true
}

const SETTINGS_KEY = 'momai_emails_v1_settings'

export interface SettingsStore {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

const memoryStore = (): SettingsStore => {
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

function asWindowHours(value: unknown): UnreadWindowHours {
  return value === 24 ? 24 : 48
}

export function unreadWindowMs(hours: UnreadWindowHours): number {
  return hours * 60 * 60 * 1000
}

let sharedMemory: SettingsStore | null = null

export function defaultSettingsStore(): SettingsStore {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {}
  if (!sharedMemory) sharedMemory = memoryStore()
  return sharedMemory
}

export function loadEmailSettings(store: SettingsStore = defaultSettingsStore()): EmailSettings {
  try {
    const raw = store.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_EMAIL_SETTINGS }
    const parsed = JSON.parse(raw) || {}
    return {
      notifyPrimaryOnly:
        typeof parsed.notifyPrimaryOnly === 'boolean'
          ? parsed.notifyPrimaryOnly
          : DEFAULT_EMAIL_SETTINGS.notifyPrimaryOnly,
      showCategoryTabs:
        typeof parsed.showCategoryTabs === 'boolean' ? parsed.showCategoryTabs : DEFAULT_EMAIL_SETTINGS.showCategoryTabs,
      unreadWindowHours: asWindowHours(parsed.unreadWindowHours),
      autoMarkRead:
        typeof parsed.autoMarkRead === 'boolean' ? parsed.autoMarkRead : DEFAULT_EMAIL_SETTINGS.autoMarkRead
    }
  } catch {
    return { ...DEFAULT_EMAIL_SETTINGS }
  }
}

export function saveEmailSettings(settings: EmailSettings, store: SettingsStore = defaultSettingsStore()): void {
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {}
}
