// src/services/prewarm.ts
// Sequential background folder pre-warming queue.
// Pre-loads message headers for inactive folders in priority order with gentle throttling,
// ensuring 0ms instant display whenever the user navigates between folders.

import type { EmailFolder, EmailMessage } from './types'
import { isVirtualStarredFolder } from './folders'

/** Pause between two folder fetches so the shared IMAP socket is not flooded. */
export const PREWARM_THROTTLE_MS = 350

/** How many times a failed folder fetch is retried before it is dropped. */
export const PREWARM_MAX_ATTEMPTS = 3

/**
 * Assigns priority weights to standard and custom folders.
 * Lower weight = higher pre-warming priority.
 */
export function getFolderPriorityWeight(folder: EmailFolder): number {
  const role = (folder.role || '').toLowerCase()
  const name = (folder.name || '').toLowerCase()
  const path = (folder.path || '').toLowerCase()

  if (role === 'inbox' || name === 'inbox' || path === 'inbox') return 1
  if (role === 'sent' || name.includes('sent') || name.includes('enviad')) return 2
  if (role === 'drafts' || name.includes('draft') || name.includes('rascunh')) return 3
  if (role === 'junk' || name.includes('spam') || name.includes('junk')) return 4
  if (role === 'trash' || name.includes('trash') || name.includes('lixeir')) return 5
  if (role === 'archive' || name.includes('archive') || name.includes('arquivo')) return 6
  return 10 // custom folders
}

/**
 * Sorts server folders in priority order for background pre-warming,
 * skipping virtual folders and excluded folders.
 */
export function sortFoldersForPrewarm(folders: EmailFolder[]): EmailFolder[] {
  return folders
    .filter((f) => {
      if (!f || !f.path) return false
      if (isVirtualStarredFolder(f.path, folders)) return false
      const lower = f.name.toLowerCase().replace(/^\[gmail\]\/?/i, '').trim()
      const pathLower = f.path.toLowerCase().replace(/^\[gmail\]\/?/i, '').trim()
      if (
        f.role === 'all' ||
        lower === 'all mail' ||
        lower === 'todos os e-mails' ||
        lower === 'todos os emails' ||
        lower === 'all' ||
        pathLower.includes('all mail') ||
        pathLower.includes('todos os e-mails') ||
        pathLower.includes('todos os emails')
      ) {
        return false
      }
      return true
    })
    .sort((a, b) => getFolderPriorityWeight(a) - getFolderPriorityWeight(b))
}

/**
 * Merges a freshly fetched folder head with the messages already cached,
 * newest first. Background fetches return short heads that overlap the cache,
 * so replacing would shrink the instant list shown on the next open.
 */
export function mergeFolderMessages(
  existing: EmailMessage[],
  incoming: EmailMessage[],
  limit = 150
): EmailMessage[] {
  const seen = new Set<string>()
  const merged: EmailMessage[] = []
  for (const msg of [...incoming, ...existing]) {
    if (seen.has(msg.id)) continue
    seen.add(msg.id)
    merged.push(msg)
    if (merged.length >= limit) break
  }
  return merged
}

/**
 * Sorts messages newest first. Needed when batches fetched from different
 * depths of the mailbox are merged (e.g. the Gmail category supplement), so
 * the list order never depends on batch arrival order. Ties keep their
 * previous relative order.
 */
export function sortMessagesNewestFirst(messages: EmailMessage[]): EmailMessage[] {
  return messages
    .map((msg, index) => ({ msg, index }))
    .sort((a, b) => (b.msg.timestamp || 0) - (a.msg.timestamp || 0) || a.index - b.index)
    .map((entry) => entry.msg)
}

export interface PrewarmTaskOptions {
  accountId: string
  folders: EmailFolder[]
  isCached: (folderPath: string, accountId: string) => boolean
  fetchEmails: (folderPath: string, accountId: string) => Promise<{ ok: boolean; messages?: EmailMessage[] }>
  onFolderLoaded: (folderPath: string, accountId: string, messages: EmailMessage[]) => void
  throttleMs?: number
  maxAttempts?: number
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Session-scoped folder warmer. Calling `start` again with fresh folders for
 * the account that is already being warmed appends only the new folders to the
 * running queue instead of cancelling it and starting over, so frequent folder
 * list refreshes (new mail, sync, settings) cannot starve the queue.
 */
export class FolderPrewarmer {
  private currentAccountId: string | null = null
  private isRunning = false
  private cancelled = false
  private generation = 0
  private options: PrewarmTaskOptions | null = null
  private queue: EmailFolder[] = []
  private queuedPaths = new Set<string>()
  private attempts = new Map<string, number>()

  public start(options: PrewarmTaskOptions): void {
    if (this.currentAccountId === options.accountId && this.isRunning) {
      this.options = options
      this.enqueue(options.folders)
      return
    }

    this.reset()
    this.options = options
    this.currentAccountId = options.accountId
    this.cancelled = false
    this.enqueue(options.folders)
    this.isRunning = true
    void this.run(options.accountId, this.generation)
  }

  public stop(): void {
    this.reset()
  }

  public isActive(): boolean {
    return this.isRunning
  }

  private reset(): void {
    this.generation += 1
    this.cancelled = true
    this.isRunning = false
    this.currentAccountId = null
    this.options = null
    this.queue = []
    this.queuedPaths.clear()
    this.attempts.clear()
  }

  private enqueue(folders: EmailFolder[]): void {
    for (const folder of sortFoldersForPrewarm(folders)) {
      if (this.queuedPaths.has(folder.path)) continue
      this.queuedPaths.add(folder.path)
      this.queue.push(folder)
    }
    this.queue = sortFoldersForPrewarm(this.queue)
  }

  private async run(accountId: string, generation: number): Promise<void> {
    while (!this.cancelled && this.currentAccountId === accountId && this.generation === generation) {
      const folder = this.queue.shift()
      if (!folder) break
      const options = this.options
      if (!options) break

      let handled = false
      try {
        if (options.isCached(folder.path, accountId)) {
          handled = true
        } else {
          const res = await options.fetchEmails(folder.path, accountId)
          if (this.cancelled || this.currentAccountId !== accountId || this.generation !== generation) break
          if (res && res.ok && Array.isArray(res.messages)) {
            options.onFolderLoaded(folder.path, accountId, res.messages)
            handled = true
          }
        }
      } catch {
        handled = false
      }

      if (handled) {
        this.queuedPaths.delete(folder.path)
        this.attempts.delete(folder.path)
      } else if (!this.cancelled && this.currentAccountId === accountId && this.generation === generation) {
        this.retry(folder)
      }

      if (this.cancelled || this.currentAccountId !== accountId || this.generation !== generation) break
      const throttle = typeof options.throttleMs === 'number' ? options.throttleMs : PREWARM_THROTTLE_MS
      if (throttle > 0) await delay(throttle)
    }

    if (this.currentAccountId === accountId && this.generation === generation) {
      this.isRunning = false
    }
  }

  private retry(folder: EmailFolder): void {
    const attempts = (this.attempts.get(folder.path) || 0) + 1
    const options = this.options
    const maxAttempts =
      options && typeof options.maxAttempts === 'number' ? options.maxAttempts : PREWARM_MAX_ATTEMPTS
    if (attempts < maxAttempts) {
      this.attempts.set(folder.path, attempts)
      this.queue.push(folder)
      return
    }
    this.attempts.delete(folder.path)
    this.queuedPaths.delete(folder.path)
  }
}
