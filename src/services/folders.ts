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

export function isTrashFolder(folderPath?: string | null, role?: string | null): boolean {
  if ((role || '').toLowerCase() === 'trash') return true
  const normalized = normalizeFolderPath(folderPath)
  if (!normalized) return false
  return normalized.includes('trash') || normalized.includes('lixeir') || normalized.includes('deleted')
}

export function isArchiveFolder(folderPath?: string | null, role?: string | null): boolean {
  const cleanRole = (role || '').toLowerCase()
  if (cleanRole === 'archive') return true
  const normalized = normalizeFolderPath(folderPath)
  if (!normalized) return false
  return normalized.includes('archiv') || normalized.includes('arquivo')
}

export function isDraftsFolder(folderPath?: string | null, role?: string | null): boolean {
  if ((role || '').toLowerCase() === 'drafts') return true
  const normalized = normalizeFolderPath(folderPath)
  if (!normalized) return false
  return normalized.includes('draft') || normalized.includes('rascunh')
}

export function isSentFolder(folderPath?: string | null, role?: string | null): boolean {
  if ((role || '').toLowerCase() === 'sent') return true
  const normalized = normalizeFolderPath(folderPath)
  if (!normalized) return false
  return normalized.includes('sent') || normalized.includes('enviad')
}

export function resolveInboxPath(folders: EmailFolder[], fallback = 'INBOX'): string {
  const inbox = folders.find((folder) => isInboxFolder(folder.path, folder.role))
  return inbox ? inbox.path : fallback
}

export function resolveDraftsPath(folders: EmailFolder[], fallback = 'Drafts'): string {
  const drafts = folders.find((folder) => isDraftsFolder(folder.path, folder.role))
  return drafts ? drafts.path : fallback
}

/**
 * Whether a message is a draft: either it carries the server \Draft flag
 * (drafts keep it even after moving to trash) or it sits in a drafts folder.
 */
export function isDraftMessage(
  msg: { folder?: string | null; draft?: boolean | null } | null | undefined,
  folders: EmailFolder[] = []
): boolean {
  if (!msg) return false
  if (msg.draft === true) return true
  const folderPath = msg.folder || ''
  const match = folders.find((f) => f.path.toLowerCase() === folderPath.toLowerCase())
  return isDraftsFolder(folderPath, match?.role)
}

export function resolveArchivePath(folders: EmailFolder[], fallback = 'Archive'): string {
  const archive = folders.find((folder) => isArchiveFolder(folder.path, folder.role))
  return archive ? archive.path : fallback
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

export const DEFAULT_STATIC_FOLDERS: EmailFolder[] = [
  { path: 'INBOX', name: 'INBOX', role: 'inbox', unreadCount: 0, totalCount: 0 },
  { path: 'Archive', name: 'Archive', role: 'archive', unreadCount: 0, totalCount: 0 },
  { path: 'Junk', name: 'Junk', role: 'junk', unreadCount: 0, totalCount: 0 },
  { path: 'Drafts', name: 'Drafts', role: 'drafts', unreadCount: 0, totalCount: 0 },
  { path: 'Sent', name: 'Sent', role: 'sent', unreadCount: 0, totalCount: 0 },
  { path: 'Trash', name: 'Trash', role: 'trash', unreadCount: 0, totalCount: 0 },
  { path: 'starred', name: 'starred', role: 'starred', unreadCount: 0, totalCount: 0 }
]

export function getDefaultFolders(): EmailFolder[] {
  return DEFAULT_STATIC_FOLDERS.map((f) => ({ ...f }))
}

const ROLE_ORDER: Record<string, number> = {
  inbox: 1,
  archive: 2,
  junk: 3,
  drafts: 4,
  sent: 5,
  trash: 6,
  starred: 7,
  important: 8,
  custom: 99
}

export function sortFoldersByStandardOrder(folders: EmailFolder[]): EmailFolder[] {
  return [...folders].sort((a, b) => {
    const orderA = ROLE_ORDER[a.role || 'custom'] ?? 50
    const orderB = ROLE_ORDER[b.role || 'custom'] ?? 50
    if (orderA !== orderB) return orderA - orderB
    return a.name.localeCompare(b.name)
  })
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

export function mergeWithDefaultFolders(serverFolders: EmailFolder[]): EmailFolder[] {
  if (!serverFolders || serverFolders.length === 0) {
    return getDefaultFolders()
  }
  const deduped = dedupeFoldersByRole(serverFolders)
  const existingRoles = new Set(deduped.map((f) => f.role).filter(Boolean))
  const hasRealArchive = deduped.some((f) => isArchiveFolder(f.path, f.role))
  const merged = [...deduped]
  for (const def of DEFAULT_STATIC_FOLDERS) {
    if (def.role === 'archive' && hasRealArchive) continue
    if (def.role && !existingRoles.has(def.role)) {
      merged.push({ ...def })
      existingRoles.add(def.role)
    }
  }
  return sortFoldersByStandardOrder(ensureStarredFolder(merged))
}

