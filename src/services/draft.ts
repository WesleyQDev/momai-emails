// src/services/draft.ts
// Draft guard helpers: decide whether closing the composer must save a draft.

import type { EmailMessage, OutgoingAttachment } from './types'

export interface DraftContent {
  to?: string
  cc?: string
  bcc?: string
  subject?: string
  body?: string
  attachments?: Array<Partial<OutgoingAttachment>>
}

export function stripHtmlToText(html?: string | null): string {
  if (!html) return ''
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p\s*>/gi, ' ')
    .replace(/<\/div\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function hasDraftContent(input: DraftContent): boolean {
  if ((input.to || '').trim()) return true
  if ((input.cc || '').trim()) return true
  if ((input.bcc || '').trim()) return true
  if ((input.subject || '').trim()) return true
  if (Array.isArray(input.attachments) && input.attachments.length > 0) return true
  return stripHtmlToText(input.body).length > 0
}

/**
 * Closes the composer immediately and saves the draft in the background.
 * Returns true when a background save was started, false when the composer
 * just closed (empty content or no save handler). Failures never reopen
 * the composer; they are reported through onError.
 */
export function closeAndSaveDraftInBackground(
  content: DraftContent,
  onClose: () => void,
  save?: () => Promise<unknown>,
  onError?: (err: unknown) => void
): boolean {
  if (!hasDraftContent(content) || !save) {
    onClose()
    return false
  }
  onClose()
  try {
    const pending = save()
    if (pending && typeof (pending as Promise<unknown>).catch === 'function') {
      ;(pending as Promise<unknown>).catch((err: unknown) => {
        try {
          onError?.(err)
        } catch {
          // Error reporting must never throw back into the background task.
        }
      })
    }
  } catch (err: unknown) {
    try {
      onError?.(err)
    } catch {
      // Ignore reporting errors.
    }
  }
  return true
}

export interface PendingDraftInput {
  to?: string
  subject?: string
  body?: string
  accountEmail?: string
  draftsFolder?: string
}

/**
 * Builds an instant list item for a draft that is still being saved in the
 * background. It is replaced by the real server message on the next refresh
 * and is never written to the folder cache, so it cannot duplicate.
 */
export function buildPendingDraft(input: PendingDraftInput): EmailMessage {
  const now = Date.now()
  const pendingId = `pending-draft-${now}-${Math.floor(Math.random() * 100000)}`
  const recipients = String(input.to || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((address) => ({ name: '', address }))
  return {
    id: pendingId,
    uid: 0,
    messageId: pendingId,
    folder: input.draftsFolder || 'Drafts',
    subject: input.subject || '',
    from: { name: '', address: input.accountEmail || '' },
    to: recipients,
    date: new Date(now).toISOString(),
    timestamp: now,
    read: true,
    starred: false,
    snippet: stripHtmlToText(input.body).slice(0, 200)
  }
}

/**
 * Drops pending draft items once the server list arrives.
 */
export function removePendingDrafts(messages: EmailMessage[], pendingIds: string[]): EmailMessage[] {
  if (!pendingIds || pendingIds.length === 0) return messages
  const pending = new Set(pendingIds)
  return messages.filter((m) => !pending.has(m.id))
}

const KNOWN_DRAFTS_STORAGE_KEY = 'momai-emails-known-draft-ids'
const MAX_KNOWN_DRAFTS_PER_ACCOUNT = 300

// In-memory fallback for non-browser runtimes (tests, workers).
const memoryLedger = new Map<string, string[]>()

interface LedgerStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function getLedgerStore(): LedgerStore | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch {
    // Storage unavailable: fall back to memory below.
  }
  return null
}

function readLedger(): Map<string, string[]> {
  const store = getLedgerStore()
  if (!store) return new Map(memoryLedger)
  try {
    const raw = store.getItem(KNOWN_DRAFTS_STORAGE_KEY)
    if (!raw) return new Map()
    const parsed = JSON.parse(raw) as Record<string, string[]>
    return new Map(Object.entries(parsed).filter(([, ids]) => Array.isArray(ids)))
  } catch {
    return new Map()
  }
}

function writeLedger(ledger: Map<string, string[]>): void {
  const trimmed = new Map<string, string[]>()
  for (const [accountKey, ids] of ledger) {
    if (ids.length > 0) trimmed.set(accountKey, ids.slice(-MAX_KNOWN_DRAFTS_PER_ACCOUNT))
  }
  memoryLedger.clear()
  for (const [accountKey, ids] of trimmed) memoryLedger.set(accountKey, ids)
  const store = getLedgerStore()
  if (!store) return
  try {
    store.setItem(KNOWN_DRAFTS_STORAGE_KEY, JSON.stringify(Object.fromEntries(trimmed)))
  } catch {
    // Quota or access errors must never break the draft flow.
  }
}

/**
 * Remembers a draft by its RFC message id, which survives IMAP moves
 * (UIDs change when a draft is trashed, message ids do not). Used so
 * trashed drafts keep their badge even when the server drops the flag.
 */
export function rememberDraftMessage(accountKey: string, messageId?: string | null): void {
  const id = (messageId || '').trim()
  if (!accountKey || !id) return
  const ledger = readLedger()
  const ids = ledger.get(accountKey) || []
  if (!ids.includes(id)) ids.push(id)
  ledger.set(accountKey, ids)
  writeLedger(ledger)
}

export function forgetDraftMessage(accountKey: string, messageId?: string | null): void {
  const id = (messageId || '').trim()
  if (!accountKey || !id) return
  const ledger = readLedger()
  const ids = (ledger.get(accountKey) || []).filter((entry) => entry !== id)
  if (ids.length > 0) ledger.set(accountKey, ids)
  else ledger.delete(accountKey)
  writeLedger(ledger)
}

export function isKnownDraftMessage(accountKey: string, messageId?: string | null): boolean {
  const id = (messageId || '').trim()
  if (!accountKey || !id) return false
  return (readLedger().get(accountKey) || []).includes(id)
}
