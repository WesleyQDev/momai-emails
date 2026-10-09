// src/services/paging.ts
// Shared page size and numbered-page window for the message list.

export const EMAIL_PAGE_SIZE = 30

/**
 * Newest messages fetched on the first inbox load. The visible Principal tab
 * is a category-filtered subset of this window, so it is several pages wide:
 * one fetch fills page 1 in a single update instead of dripping through
 * follow-up load-more roundtrips. Matches MAX_STORED_FOLDER_MESSAGES so the
 * whole window persists in the instant cache for the next open.
 */
export const INBOX_FIRST_LOAD_LIMIT = 500

/**
 * Newest messages of the Primary category fetched alongside the inbox window.
 * Gmail's server-side category filter guarantees a full Principal page even
 * when primary mail is sparse among the newest inbox messages, so the tab
 * never fills in slowly, window by window.
 */
export const INBOX_CATEGORY_FIRST_LOAD = EMAIL_PAGE_SIZE * 2

export interface PageWindow {
  start: number
  end: number
}

export function getPageWindow(count: number, page: number, pageSize: number): PageWindow {
  const safePage = Math.max(0, page)
  const start = safePage * pageSize
  return { start, end: Math.min(start + pageSize, Math.max(0, count)) }
}

export interface FreshRunState {
  /** Key of the account+folder this run belongs to. */
  key: string
  /** How many of the newest messages are already loaded in one contiguous run. */
  length: number
  /** Mailbox total reported by the server with the latest fetch. */
  total: number
}

/**
 * Advances the contiguous server run after a fresh inbox fetch.
 *
 * The visible list also holds older cached messages outside the server
 * window, so `messages.length` must never drive the next offset: every
 * cached extra would permanently skip one newer message on the server.
 * Tracking only server-fetched windows keeps pagination contiguous; mail
 * arriving or leaving mid-session only causes harmless overlap (removed by
 * id dedup) instead of permanent holes.
 */
export function nextFreshRunLength(
  prevLength: number | null,
  prevTotal: number | null,
  freshLength: number,
  newTotal: number
): number {
  if (prevLength == null || prevTotal == null) return freshLength
  const carried = prevLength + (newTotal - prevTotal)
  return Math.max(freshLength, carried)
}
