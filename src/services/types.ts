// src/services/types.ts
// Shared types for MomAI E-mails

import { ProviderId } from './providers'

export interface EmailAddress {
  name: string
  address: string
}

export interface EmailAttachment {
  id?: string
  filename: string
  contentType: string
  size: number
  contentId?: string
}

export interface EmailMessage {
  id: string // UID or internal id
  uid: number
  messageId: string
  folder: string
  subject: string
  from: EmailAddress
  to: EmailAddress[]
  cc?: EmailAddress[]
  bcc?: EmailAddress[]
  replyTo?: EmailAddress[]
  date: string
  timestamp: number
  read: boolean
  starred: boolean
  snippet: string
  text?: string
  html?: string
  hasAttachments?: boolean
  attachments?: EmailAttachment[]
}

export interface EmailFolder {
  path: string
  name: string
  role?: 'inbox' | 'sent' | 'drafts' | 'trash' | 'junk' | 'archive' | 'starred' | 'custom'
  unreadCount: number
  totalCount: number
}

export interface EmailAccountConfig {
  id: string
  name: string
  email: string
  provider: ProviderId
  password?: string // only in worker memory/encrypted storage, never sent to UI!
  imap: {
    host: string
    port: number
    secure: boolean
    user?: string
  }
  smtp: {
    host: string
    port: number
    secure: boolean
    requireTLS?: boolean
    user?: string
  }
  createdAt: number
  updatedAt: number
  active: boolean
  status: 'connected' | 'error' | 'connecting' | 'idle'
  lastError?: string
  unreadCount?: number
}

export type PublicEmailAccount = Omit<EmailAccountConfig, 'password'>

export interface SendEmailPayload {
  accountId?: string
  to: string
  subject: string
  body: string
  isHtml?: boolean
  cc?: string
  bcc?: string
  inReplyTo?: string
  references?: string
}
