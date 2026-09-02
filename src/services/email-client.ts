// src/services/email-client.ts
// Handles real SMTP (nodemailer) and IMAP (imapflow) operations with mailparser

const { ImapFlow } = require('imapflow')
const nodemailer = require('nodemailer')
const { simpleParser } = require('mailparser')

import type { EmailAccountConfig, EmailMessage, EmailFolder, SendEmailPayload } from './types'

export interface ConnectionTestResult {
  ok: boolean
  imapOk: boolean
  smtpOk: boolean
  error?: string
}

/**
 * Creates an ImapFlow client instance for the specified account.
 */
export function createImapClient(account: EmailAccountConfig, logger = false) {
  const username = account.imap.user || account.email
  const password = account.password || ''
  return new ImapFlow({
    host: account.imap.host,
    port: account.imap.port,
    secure: account.imap.secure,
    auth: {
      user: username,
      pass: password
    },
    logger: logger ? false : false,
    emitLogs: false,
    tls: {
      rejectUnauthorized: false
    }
  })
}

/**
 * Creates a Nodemailer transporter for the specified account.
 */
export function createSmtpTransporter(account: EmailAccountConfig) {
  const username = account.smtp.user || account.email
  const password = account.password || ''
  return nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: {
      user: username,
      pass: password
    },
    tls: {
      rejectUnauthorized: false
    }
  })
}

/**
 * Test both IMAP and SMTP connections for an account.
 */
export async function testAccountConnection(account: EmailAccountConfig): Promise<ConnectionTestResult> {
  let imapOk = false
  let smtpOk = false
  let errorMsg = ''

  // 1. Test IMAP
  const client = createImapClient(account)
  try {
    await client.connect()
    imapOk = true
    await client.logout().catch(() => {})
  } catch (err: any) {
    errorMsg = `Falha IMAP (${account.imap.host}:${account.imap.port}): ${err?.message || err}`
    return { ok: false, imapOk: false, smtpOk: false, error: errorMsg }
  }

  // 2. Test SMTP
  const transporter = createSmtpTransporter(account)
  try {
    await transporter.verify()
    smtpOk = true
  } catch (err: any) {
    errorMsg = `Falha SMTP (${account.smtp.host}:${account.smtp.port}): ${err?.message || err}`
    return { ok: false, imapOk, smtpOk: false, error: errorMsg }
  }

  return { ok: imapOk && smtpOk, imapOk, smtpOk }
}

/**
 * List folders/mailboxes for an account.
 */
export async function listMailboxes(account: EmailAccountConfig): Promise<EmailFolder[]> {
  const client = createImapClient(account)
  await client.connect()
  try {
    const list = await client.list()
    const folders: EmailFolder[] = []
    for (const item of list) {
      if (item.flags && item.flags.has('\\Noselect')) continue
      let role: EmailFolder['role'] = 'custom'
      const special = item.specialUse || ''
      const pathLower = item.path.toLowerCase()
      if (special === '\\Inbox' || pathLower === 'inbox') role = 'inbox'
      else if (special === '\\Sent' || pathLower.includes('sent') || pathLower.includes('enviad')) role = 'sent'
      else if (special === '\\Drafts' || pathLower.includes('draft') || pathLower.includes('rascunh')) role = 'drafts'
      else if (special === '\\Trash' || pathLower.includes('trash') || pathLower.includes('lixeir')) role = 'trash'
      else if (special === '\\Junk' || pathLower.includes('junk') || pathLower.includes('spam')) role = 'junk'
      else if (special === '\\Archive' || pathLower.includes('archiv') || pathLower.includes('arquivo')) role = 'archive'

      let status = { unseen: 0, messages: 0 }
      try {
        status = await client.status(item.path, { unseen: true, messages: true })
      } catch {}

      folders.push({
        path: item.path,
        name: item.name,
        role,
        unreadCount: status.unseen || 0,
        totalCount: status.messages || 0
      })
    }
    // Ensure INBOX is first if present
    folders.sort((a, b) => {
      if (a.role === 'inbox') return -1
      if (b.role === 'inbox') return 1
      return a.name.localeCompare(b.name)
    })
    return folders
  } finally {
    await client.logout().catch(() => {})
  }
}

/**
 * Fetch messages list from a mailbox.
 */
export async function fetchMessages(
  account: EmailAccountConfig,
  folder = 'INBOX',
  limit = 25,
  unreadOnly = false
): Promise<EmailMessage[]> {
  const client = createImapClient(account)
  await client.connect()
  const messages: EmailMessage[] = []
  try {
    const lock = await client.getMailboxLock(folder)
    try {
      const mailbox = client.mailbox
      if (!mailbox || mailbox.exists === 0) return []

      const searchCriteria: any = unreadOnly ? { seen: false } : { all: true }
      const uids = await client.search(searchCriteria, { uid: true })
      if (!uids || uids.length === 0) return []

      // Sort descending (latest first) and slice by limit
      uids.sort((a: number, b: number) => b - a)
      const targetUids = uids.slice(0, limit)

      if (targetUids.length === 0) return []

      // Fetch envelope and body structure
      for await (const msg of client.fetch(targetUids, {
        uid: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
        size: true
      })) {
        const env = msg.envelope || {}
        const fromAddr = env.from?.[0] || { name: '', address: 'desconhecido@email.com' }
        const toAddrs = (env.to || []).map((t: any) => ({ name: t.name || '', address: t.address || '' }))
        const isRead = msg.flags ? msg.flags.has('\\Seen') : false
        const isStarred = msg.flags ? msg.flags.has('\\Flagged') : false

        messages.push({
          id: String(msg.uid),
          uid: msg.uid,
          messageId: env.messageId || String(msg.uid),
          folder,
          subject: env.subject || '(Sem assunto)',
          from: { name: fromAddr.name || fromAddr.address, address: fromAddr.address },
          to: toAddrs,
          date: env.date ? new Date(env.date).toISOString() : new Date().toISOString(),
          timestamp: env.date ? new Date(env.date).getTime() : Date.now(),
          read: isRead,
          starred: isStarred,
          snippet: ''
        })
      }
    } finally {
      lock.release()
    }

    // Sort latest first
    messages.sort((a, b) => b.timestamp - a.timestamp)
    return messages
  } finally {
    await client.logout().catch(() => {})
  }
}

/**
 * Fetch full message details including parsed body (HTML/Text) and attachments.
 */
export async function fetchFullMessage(
  account: EmailAccountConfig,
  uidOrMessageId: string | number,
  folder = 'INBOX'
): Promise<EmailMessage | null> {
  const client = createImapClient(account)
  await client.connect()
  try {
    const lock = await client.getMailboxLock(folder)
    try {
      const targetUid = typeof uidOrMessageId === 'number' ? uidOrMessageId : parseInt(uidOrMessageId, 10)
      let resolvedUid = targetUid

      if (isNaN(resolvedUid)) {
        // Search by header Message-ID
        const found = await client.search({ header: ['message-id', uidOrMessageId] }, { uid: true })
        if (found && found.length > 0) resolvedUid = found[0]
        else return null
      }

      // Download source RFC822 and parse with mailparser
      const download = await client.download(resolvedUid, undefined, { uid: true })
      if (!download || !download.content) return null

      const parsed = await simpleParser(download.content)
      const fromAddr = parsed.from?.value?.[0] || { name: '', address: 'desconhecido' }
      const toAddrs = (parsed.to?.value || []).map((t: any) => ({ name: t.name || '', address: t.address || '' }))
      const ccAddrs = (parsed.cc?.value || []).map((c: any) => ({ name: c.name || '', address: c.address || '' }))
      const bccAddrs = (parsed.bcc?.value || []).map((b: any) => ({ name: b.name || '', address: b.address || '' }))

      // Fetch flags for read/starred status
      let isRead = false
      let isStarred = false
      for await (const msg of client.fetch(resolvedUid, { uid: true, flags: true })) {
        if (msg.flags) {
          isRead = msg.flags.has('\\Seen')
          isStarred = msg.flags.has('\\Flagged')
        }
      }

      const attachments = (parsed.attachments || []).map((att: any) => ({
        id: att.cid || att.filename,
        filename: att.filename || 'anexo',
        contentType: att.contentType || 'application/octet-stream',
        size: att.size || (att.content ? att.content.length : 0),
        contentId: att.cid
      }))

      return {
        id: String(resolvedUid),
        uid: resolvedUid,
        messageId: parsed.messageId || String(resolvedUid),
        folder,
        subject: parsed.subject || '(Sem assunto)',
        from: { name: fromAddr.name || fromAddr.address, address: fromAddr.address },
        to: toAddrs,
        cc: ccAddrs,
        bcc: bccAddrs,
        date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
        timestamp: parsed.date ? parsed.date.getTime() : Date.now(),
        read: isRead,
        starred: isStarred,
        snippet: (parsed.text || '').slice(0, 150).replace(/\s+/g, ' ').trim(),
        text: parsed.text || '',
        html: parsed.html || (parsed.textAsHtml ? parsed.textAsHtml : undefined),
        hasAttachments: attachments.length > 0,
        attachments
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

/**
 * Search emails by query (from, to, subject, body).
 */
export async function searchMessages(
  account: EmailAccountConfig,
  query: string,
  folder = 'INBOX',
  limit = 20
): Promise<EmailMessage[]> {
  const client = createImapClient(account)
  await client.connect()
  const messages: EmailMessage[] = []
  try {
    const lock = await client.getMailboxLock(folder)
    try {
      const q = query.trim()
      const searchCriteria: any = {
        or: [
          { subject: q },
          { from: q },
          { to: q },
          { body: q }
        ]
      }
      const uids = await client.search(searchCriteria, { uid: true })
      if (!uids || uids.length === 0) return []

      uids.sort((a: number, b: number) => b - a)
      const targetUids = uids.slice(0, limit)

      for await (const msg of client.fetch(targetUids, {
        uid: true,
        envelope: true,
        flags: true
      })) {
        const env = msg.envelope || {}
        const fromAddr = env.from?.[0] || { name: '', address: '' }
        const toAddrs = (env.to || []).map((t: any) => ({ name: t.name || '', address: t.address || '' }))
        messages.push({
          id: String(msg.uid),
          uid: msg.uid,
          messageId: env.messageId || String(msg.uid),
          folder,
          subject: env.subject || '(Sem assunto)',
          from: { name: fromAddr.name || fromAddr.address, address: fromAddr.address },
          to: toAddrs,
          date: env.date ? new Date(env.date).toISOString() : new Date().toISOString(),
          timestamp: env.date ? new Date(env.date).getTime() : Date.now(),
          read: msg.flags ? msg.flags.has('\\Seen') : false,
          starred: msg.flags ? msg.flags.has('\\Flagged') : false,
          snippet: ''
        })
      }
    } finally {
      lock.release()
    }
    messages.sort((a, b) => b.timestamp - a.timestamp)
    return messages
  } finally {
    await client.logout().catch(() => {})
  }
}

/**
 * Send an email via SMTP.
 */
export async function sendEmail(
  account: EmailAccountConfig,
  payload: SendEmailPayload
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const transporter = createSmtpTransporter(account)
  try {
    const fromAddress = account.name ? `"${account.name}" <${account.email}>` : account.email
    const mailOptions: any = {
      from: fromAddress,
      to: payload.to,
      subject: payload.subject,
      cc: payload.cc || undefined,
      bcc: payload.bcc || undefined
    }

    if (payload.isHtml) {
      mailOptions.html = payload.body
      mailOptions.text = payload.body.replace(/<[^>]*>?/gm, '')
    } else {
      mailOptions.text = payload.body
    }

    if (payload.inReplyTo) {
      mailOptions.inReplyTo = payload.inReplyTo
      mailOptions.references = payload.references || payload.inReplyTo
    }

    const info = await transporter.sendMail(mailOptions)
    return { ok: true, messageId: info.messageId }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}

/**
 * Mark a message as read or unread.
 */
export async function setMessageReadStatus(
  account: EmailAccountConfig,
  uid: number,
  read: boolean,
  folder = 'INBOX'
): Promise<boolean> {
  const client = createImapClient(account)
  await client.connect()
  try {
    const lock = await client.getMailboxLock(folder)
    try {
      if (read) {
        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true })
      } else {
        await client.messageFlagsRemove(uid, ['\\Seen'], { uid: true })
      }
      return true
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

/**
 * Toggle starred flag on a message.
 */
export async function setMessageStarredStatus(
  account: EmailAccountConfig,
  uid: number,
  starred: boolean,
  folder = 'INBOX'
): Promise<boolean> {
  const client = createImapClient(account)
  await client.connect()
  try {
    const lock = await client.getMailboxLock(folder)
    try {
      if (starred) {
        await client.messageFlagsAdd(uid, ['\\Flagged'], { uid: true })
      } else {
        await client.messageFlagsRemove(uid, ['\\Flagged'], { uid: true })
      }
      return true
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

/**
 * Delete a message (move to Trash if available, otherwise add \\Deleted flag).
 */
export async function deleteMessage(
  account: EmailAccountConfig,
  uid: number,
  folder = 'INBOX'
): Promise<boolean> {
  const client = createImapClient(account)
  await client.connect()
  try {
    const lock = await client.getMailboxLock(folder)
    try {
      // Find trash mailbox
      const list = await client.list()
      const trashBox = list.find((m: any) => m.specialUse === '\\Trash' || m.path.toLowerCase().includes('trash') || m.path.toLowerCase().includes('lixeir'))

      if (trashBox && trashBox.path !== folder) {
        await client.messageMove(uid, trashBox.path, { uid: true })
      } else {
        await client.messageDelete(uid, { uid: true })
      }
      return true
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

/**
 * Move message between mailboxes.
 */
export async function moveMessage(
  account: EmailAccountConfig,
  uid: number,
  fromFolder: string,
  toFolder: string
): Promise<boolean> {
  const client = createImapClient(account)
  await client.connect()
  try {
    const lock = await client.getMailboxLock(fromFolder)
    try {
      await client.messageMove(uid, toFolder, { uid: true })
      return true
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}
