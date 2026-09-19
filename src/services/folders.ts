// src/services/folders.ts
// Folder helpers for spam detection, favorites and move destinations.

import type { EmailFolder, EmailMessage } from './types'

export const VIRTUAL_STARRED_PATH = 'starred'

export function normalizeFolderPath(value?: string | null): string {
  return (value || '').toLowerCase().replace(/^\[gmail\]\/?/i, '').trim()
}

export function isSpamFolder(folderPath?: string | null, role?: string | null): boolean {
  if ((role || '').toLowerCase() === 'junk') return true
  const normalized = normalizeFolderPath(folderPath)
  return normalized.includes('spam') || normalized.includes('junk')
}

export function isInboxFolder(folderPath?: string | null, role?: string | null): boolean {
  if ((role || '').toLowerCase() === 'inbox') return true
  return normalizeFolderPath(folderPath) === 'inbox'
}

export function resolveInboxPath(folders: EmailFolder[], fallback = 'INBOX'): string {
  const inbox = folders.find((folder) => isInboxFolder(folder.path, folder.role))
  return inbox ? inbox.path : fallback
}

export function getMoveTargets(folders: EmailFolder[], currentPath: string): EmailFolder[] {
  const current = normalizeFolderPath(currentPath)
  return folders.filter((folder) => normalizeFolderPath(folder.path) !== current)
}

export function isStarredFolder(folderPath?: string | null, role?: string | null): boolean {
  if ((role || '').toLowerCase() === 'starred') return true
  return normalizeFolderPath(folderPath) === VIRTUAL_STARRED_PATH
}

export function ensureStarredFolder(folders: EmailFolder[]): EmailFolder[] {
  if (folders.some((folder) => isStarredFolder(folder.path, folder.role))) return folders
  return [
    ...folders,
    {
      path: VIRTUAL_STARRED_PATH,
      name: VIRTUAL_STARRED_PATH,
      role: 'starred',
      unreadCount: 0,
      totalCount: 0
    }
  ]
}

export function getStarredMessages(messages: EmailMessage[]): EmailMessage[] {
  return messages
    .filter((message) => message.starred)
    .sort((a, b) => b.timestamp - a.timestamp)
}

export function isVirtualStarredFolder(folderPath: string, serverFolders: EmailFolder[]): boolean {
  if (!isStarredFolder(folderPath)) return false
  return !serverFolders.some((folder) => isStarredFolder(folder.path, folder.role))
}

export function dedupeFoldersByRole(folders: EmailFolder[]): EmailFolder[] {
  const seenRoles = new Set<string>()
  const deduped: EmailFolder[] = []
  const byRole = new Map<string, EmailFolder[]>()
  for (const folder of folders) {
    if (!folder.role || folder.role === 'custom') {
      deduped.push(folder)
      continue
    }
    const group = byRole.get(folder.role)
    if (group) group.push(folder)
    else byRole.set(folder.role, [folder])
  }
  for (const folder of folders) {
    if (!folder.role || folder.role === 'custom' || seenRoles.has(folder.role)) continue
    seenRoles.add(folder.role)
    const group = byRole.get(folder.role) || [folder]
    deduped.push(
      group.reduce((winner, candidate) =>
        candidate.totalCount > winner.totalCount ? candidate : winner
      )
    )
  }
  return deduped.sort((a, b) => folders.indexOf(a) - folders.indexOf(b))
}
