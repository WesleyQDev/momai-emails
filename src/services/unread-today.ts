import type { EmailFolder, EmailMessage } from './types'
import { normalizeFolderPath, isInboxFolder } from './folders'
import { classifyEmailCategory } from './email-categories'

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

export function syncInboxPrimaryUnread(
  folders: EmailFolder[],
  inboxMessages: EmailMessage[],
  useCategories: boolean,
  unreadWindowMs: number = UNREAD_WINDOW_MS
): EmailFolder[] {
  if (!Array.isArray(folders) || !Array.isArray(inboxMessages)) return folders
  const primaryUnread = countUnreadInWindow(
    useCategories
      ? inboxMessages.filter((m) => classifyEmailCategory(m) === 'primary')
      : inboxMessages,
    Date.now(),
    unreadWindowMs
  )
  return folders.map((f) => {
    if (!isInboxFolder(f.path, f.role)) return f
    return {
      ...f,
      unreadCount: primaryUnread,
      unreadWindow: primaryUnread,
      unreadToday: primaryUnread
    }
  })
}

export function adjustFolderUnread(
  folders: EmailFolder[],
  folderPath: string,
  delta: number
): EmailFolder[] {
  if (!delta || !Array.isArray(folders)) return folders
  const target = normalizeFolderPath(folderPath) || 'inbox'
  return folders.map((folder) => {
    const norm = normalizeFolderPath(folder.path)
    const isMatch =
      norm === target ||
      (norm === 'inbox' && (target === 'inbox' || target === '')) ||
      (folder.role && target && folder.role.toLowerCase() === target)
    if (!isMatch) return folder
    const next = Math.max(0, getFolderDisplayUnread(folder) + delta)
    return {
      ...folder,
      unreadCount: next,
      unreadWindow: next,
      unreadToday: next,
      totalUnread: Math.max(0, ((folder as any).totalUnread ?? folder.unreadCount ?? 0) + delta)
    }
  })
}
