// src/services/prewarm.ts
// Sequential background folder pre-warming queue.
// Pre-loads message headers for inactive folders in priority order with gentle throttling,
// ensuring 0ms instant display whenever the user navigates between folders.

import type { EmailFolder, EmailMessage } from './types'
import { isVirtualStarredFolder } from './folders'

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

export interface PrewarmTaskOptions {
  accountId: string
  folders: EmailFolder[]
  isCached: (folderPath: string, accountId: string) => boolean
  fetchEmails: (folderPath: string, accountId: string) => Promise<{ ok: boolean; messages?: EmailMessage[] }>
  onFolderLoaded: (folderPath: string, accountId: string, messages: EmailMessage[]) => void
  throttleMs?: number
}

export class FolderPrewarmer {
  private currentAccountId: string | null = null
  private isRunning = false
  private cancelled = false

  public start(options: PrewarmTaskOptions): void {
    this.stop()
    this.currentAccountId = options.accountId
    this.cancelled = false
    this.isRunning = true

    const sorted = sortFoldersForPrewarm(options.folders)
    const throttle = typeof options.throttleMs === 'number' ? options.throttleMs : 350

    void (async () => {
      for (const folder of sorted) {
        if (this.cancelled || this.currentAccountId !== options.accountId) {
          break
        }

        // If already in memory cache with valid data, skip or proceed lightly
        const alreadyCached = options.isCached(folder.path, options.accountId)
        if (alreadyCached) {
          continue
        }

        try {
          const res = await options.fetchEmails(folder.path, options.accountId)
          if (this.cancelled || this.currentAccountId !== options.accountId) {
            break
          }

          if (res && res.ok && Array.isArray(res.messages)) {
            options.onFolderLoaded(folder.path, options.accountId, res.messages)
          }
        } catch {}

        // Gentle pause between folders to prevent flooding the network socket
        if (throttle > 0 && !this.cancelled && this.currentAccountId === options.accountId) {
          await new Promise((resolve) => setTimeout(resolve, throttle))
        }
      }

      if (this.currentAccountId === options.accountId) {
        this.isRunning = false
      }
    })()
  }

  public stop(): void {
    this.cancelled = true
    this.isRunning = false
    this.currentAccountId = null
  }

  public isActive(): boolean {
    return this.isRunning
  }
}
