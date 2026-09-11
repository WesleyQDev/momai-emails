// src/services/unread-today.ts
// Folder and category badges count only unread messages from the recent window.
// Historic unread totals inflated the badges into the thousands, so the display
// layer prefers the window count and falls back through cached shapes.

import type { EmailFolder, EmailMessage } from './types'

export const UNREAD_WINDOW_MS = 48 * 60 * 60 * 1000

export function isWithinUnreadWindow(
  timestamp: number,
  now: number = Date.now(),
  windowMs: number = UNREAD_WINDOW_MS
): boolean {
  if (!timestamp || !now) return false
  const age = now - timestamp
  return age >= 0 && age <= windowMs
}

export function countUnreadInWindow(
  messages: Pick<EmailMessage, 'read' | 'timestamp'>[],
  now: number = Date.now(),
  windowMs: number = UNREAD_WINDOW_MS
): number {
  if (!Array.isArray(messages)) return 0
  let total = 0
  for (const message of messages) {
    if (!message.read && isWithinUnreadWindow(message.timestamp, now, windowMs)) total += 1
  }
  return total
}

type FolderCounts = Pick<EmailFolder, 'unreadCount'> & {
  unreadToday?: number
  unreadWindow?: number
}

export function getFolderDisplayUnread(folder: FolderCounts): number {
  if (typeof folder.unreadWindow === 'number') return folder.unreadWindow
  if (typeof folder.unreadToday === 'number') return folder.unreadToday
  return folder.unreadCount || 0
}

export function adjustFolderUnread(
  folders: EmailFolder[],
  folderPath: string,
  delta: number
): EmailFolder[] {
  if (!delta || !Array.isArray(folders)) return folders
  const target = folderPath.toLowerCase()
  return folders.map((folder) => {
    if (folder.path.toLowerCase() !== target) return folder
    const next = Math.max(0, getFolderDisplayUnread(folder) + delta)
    return {
      ...folder,
      unreadCount: next,
      ...(typeof folder.unreadWindow === 'number' ? { unreadWindow: next } : {}),
      ...(typeof folder.unreadToday === 'number' ? { unreadToday: next } : {})
    }
  })
}
