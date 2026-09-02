// src/services/cache.ts
// Persistent storage cache for MomAI Emails using localStorage

import type { EmailFolder, EmailMessage, PublicEmailAccount } from './types'

const PREFIX = 'momai_emails_v1_'

export const emailStorageCache = {
  getAccounts(): PublicEmailAccount[] | null {
    try {
      const data = localStorage.getItem(`${PREFIX}accounts`)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  },
  setAccounts(accounts: PublicEmailAccount[]) {
    try {
      localStorage.setItem(`${PREFIX}accounts`, JSON.stringify(accounts))
    } catch {}
  },
  getFolders(accId: string): EmailFolder[] | null {
    try {
      const data = localStorage.getItem(`${PREFIX}folders_${accId}`)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  },
  setFolders(accId: string, folders: EmailFolder[]) {
    try {
      localStorage.setItem(`${PREFIX}folders_${accId}`, JSON.stringify(folders))
    } catch {}
  },
  getFolderEmails(accId: string, folder: string): EmailMessage[] | null {
    try {
      const data = localStorage.getItem(`${PREFIX}emails_${accId}_${folder}`)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  },
  setFolderEmails(accId: string, folder: string, messages: EmailMessage[]) {
    try {
      // Store up to 50 latest messages per folder to keep localStorage snappy
      localStorage.setItem(`${PREFIX}emails_${accId}_${folder}`, JSON.stringify(messages.slice(0, 50)))
    } catch {}
  },
  getEmailBody(accId: string, msgId: string): EmailMessage | null {
    try {
      const data = localStorage.getItem(`${PREFIX}body_${accId}_${msgId}`)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  },
  setEmailBody(accId: string, msgId: string, email: EmailMessage) {
    try {
      localStorage.setItem(`${PREFIX}body_${accId}_${msgId}`, JSON.stringify(email))
    } catch {}
  }
}
