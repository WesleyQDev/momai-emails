// src/services/recipients.ts
// Recipient display helpers for list views (Gmail-style outgoing column).

import type { EmailAddress, EmailFolder } from './types'
import { isDraftMessage, isDraftsFolder, isSentFolder, isStarredFolder, isTrashFolder } from './folders'

function displayRecipient(entry: EmailAddress): string {
  const name = (entry?.name || '').trim()
  if (name) return name
  return (entry?.address || '').trim()
}

/**
 * Joins the recipient list for the Sent column ("Para: ...").
 * Returns an empty string when there are no recipients; callers decide
 * the fallback. Never truncates: CSS handles the visual ellipsis.
 */
export function formatSentRecipients(to?: EmailAddress[] | null): string {
  if (!Array.isArray(to) || to.length === 0) return ''
  return to.map(displayRecipient).filter((part) => part.length > 0).join(', ')
}

/**
 * Whether a list row must show recipients ("Para: ...") instead of the
 * sender, mirroring Gmail: outgoing folders (Sent, Drafts) and Trash always
 * show recipients, while the mixed Starred view decides per message.
 */
export function shouldShowRecipients(
  activeFolder: string,
  activeFolderRole?: string | null,
  msg?: { folder?: string | null; draft?: boolean | null } | null,
  folders: EmailFolder[] = []
): boolean {
  if (isSentFolder(activeFolder, activeFolderRole)) return true
  if (isDraftsFolder(activeFolder, activeFolderRole)) return true
  if (isTrashFolder(activeFolder, activeFolderRole)) return true
  if (msg && isStarredFolder(activeFolder, activeFolderRole)) {
    if (isSentFolder(msg.folder)) return true
    if (isDraftMessage(msg, folders)) return true
  }
  return false
}
