// src/services/cache.ts
// Persistent storage cache for MomAI Emails using localStorage

import type { EmailAttachment, EmailFolder, EmailMessage, PublicEmailAccount } from './types'

const PREFIX = 'momai_emails_v1_'

// Attachment payloads (base64 files and generated thumbnails) are stripped
// before persisting: a single PDF can be tens of megabytes and would blow the
// small localStorage quota, silently disabling the whole persistent cache.
export const MAX_STORED_BODY_CHARS = 400_000

// Fraction of the stored bodies dropped when the quota is reached.
export const BODY_EVICTION_RATIO = 0.5

// Latest messages kept per folder so every category tab opens instantly.
export const MAX_STORED_FOLDER_MESSAGES = 500

function stripAttachmentPayloads(email: EmailMessage): EmailMessage {
  if (!email.attachments || email.attachments.length === 0) return email
  let changed = false
  const attachments: EmailAttachment[] = email.attachments.map((attachment) => {
    if (attachment.base64Data === undefined && attachment.previewDataUrl === undefined) return attachment
    changed = true
    const rest: EmailAttachment = { ...attachment }
    delete rest.base64Data
    delete rest.previewDataUrl
    return rest
  })
  return changed ? { ...email, attachments } : email
}

function bodyStorageKey(accId: string, msgId: string): string {
  return `${PREFIX}body_${accId}_${msgId}`
}

/**
 * Drops the oldest persisted bodies to make room. Body entries are pure cache,
 * so evicting them is always safe; accounts, folders and message headers stay.
 */
function evictOldestBodyEntries(keepKey: string): void {
  try {
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key && key.startsWith(`${PREFIX}body_`) && key !== keepKey) keys.push(key)
    }
    const removeCount = Math.max(1, Math.ceil(keys.length * BODY_EVICTION_RATIO))
    for (let index = 0; index < removeCount; index += 1) {
      localStorage.removeItem(keys[index])
    }
  } catch {}
}

/**
 * Writes an entry, recovering once from quota errors by evicting old bodies.
 * Errors are swallowed because the caches are an optimization, never the
 * source of truth.
 */
function writeEntry(key: string, payload: string): void {
  try {
    localStorage.setItem(key, payload)
    return
  } catch {}
  evictOldestBodyEntries(key)
  try {
    localStorage.setItem(key, payload)
  } catch {}
}

function readEntry<T>(key: string, parse: (value: string) => T): T | null {
  try {
    const data = localStorage.getItem(key)
    return data ? parse(data) : null
  } catch {
    return null
  }
}

export const emailStorageCache = {
  getAccounts(): PublicEmailAccount[] | null {
    return readEntry(`${PREFIX}accounts`, (data) => JSON.parse(data))
  },
  setAccounts(accounts: PublicEmailAccount[]) {
    try {
      writeEntry(`${PREFIX}accounts`, JSON.stringify(accounts))
    } catch {}
  },
  getFolders(accId: string): EmailFolder[] | null {
    return readEntry(`${PREFIX}folders_${accId}`, (data) => JSON.parse(data))
  },
  setFolders(accId: string, folders: EmailFolder[]) {
    try {
      writeEntry(`${PREFIX}folders_${accId}`, JSON.stringify(folders))
    } catch {}
  },
  getFolderEmails(accId: string, folder: string): EmailMessage[] | null {
    return readEntry(`${PREFIX}emails_${accId}_${folder}`, (data) => {
      const parsed = JSON.parse(data)
      if (!Array.isArray(parsed)) throw new Error('invalid folder cache entry')
      return parsed.filter((m: EmailMessage) => !m.accountId || m.accountId === accId)
    })
  },
  setFolderEmails(accId: string, folder: string, messages: EmailMessage[]) {
    try {
      writeEntry(
        `${PREFIX}emails_${accId}_${folder}`,
        JSON.stringify(messages.slice(0, MAX_STORED_FOLDER_MESSAGES))
      )
    } catch {}
  },
  getEmailBody(accId: string, msgId: string): EmailMessage | null {
    return readEntry(bodyStorageKey(accId, msgId), (data) => JSON.parse(data))
  },
  setEmailBody(accId: string, msgId: string, email: EmailMessage) {
    try {
      const payload = JSON.stringify(stripAttachmentPayloads(email))
      if (payload.length > MAX_STORED_BODY_CHARS) return
      writeEntry(bodyStorageKey(accId, msgId), payload)
    } catch {}
  },
  removeEmailBody(accId: string, msgId: string) {
    try {
      localStorage.removeItem(bodyStorageKey(accId, msgId))
    } catch {}
  }
}
