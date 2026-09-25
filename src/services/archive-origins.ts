// src/services/archive-origins.ts
// Remembers where archived messages came from so restore returns them to origin.

const memoryFallback = new Map<string, string>()

function storage(): Storage | null {
  try {
    const candidate =
      (globalThis as any)?.localStorage ?? (typeof window !== 'undefined' ? window.localStorage : null)
    if (candidate && typeof candidate.getItem === 'function') return candidate as Storage
  } catch {}
  return null
}

function originsKey(accountId: string): string {
  return `momai_emails_v1_archive_origins_${accountId}`
}

function readOrigins(accountId: string): Record<string, string> {
  const store = storage()
  try {
    const raw = store ? store.getItem(originsKey(accountId)) : memoryFallback.get(originsKey(accountId)) ?? null
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeOrigins(accountId: string, origins: Record<string, string>): void {
  try {
    const entries = Object.entries(origins).slice(-200)
    const raw = JSON.stringify(Object.fromEntries(entries))
    const store = storage()
    if (store) store.setItem(originsKey(accountId), raw)
    else memoryFallback.set(originsKey(accountId), raw)
  } catch {}
}

export function clearAllArchiveOriginsForTests(): void {
  memoryFallback.clear()
  try {
    storage()?.clear?.()
  } catch {}
}

export function archiveMessageKey(messageId?: string | null, fallbackId?: string | null): string | null {
  const key = (messageId || fallbackId || '').trim()
  return key ? key : null
}

export function setArchiveOrigin(accountId: string, messageKey: string, originFolder: string): void {
  if (!accountId || !messageKey || !originFolder) return
  const origins = readOrigins(accountId)
  origins[messageKey] = originFolder
  writeOrigins(accountId, origins)
}

export function getArchiveOrigin(accountId: string, messageKey: string): string | null {
  if (!accountId || !messageKey) return null
  return readOrigins(accountId)[messageKey] ?? null
}

export function clearArchiveOrigin(accountId: string, messageKey: string): void {
  if (!accountId || !messageKey) return
  const origins = readOrigins(accountId)
  if (!(messageKey in origins)) return
  delete origins[messageKey]
  writeOrigins(accountId, origins)
}
