// email-client.ts
// Handles real SMTP (nodemailer) and IMAP (imapflow) operations with mailparser
// Pure CommonJS + erasable TypeScript
// Includes persistent connection pooling to eliminate cold TLS/TCP handshakes

'use strict'

const { ImapFlow } = require('imapflow')
const nodemailer = require('nodemailer')
const { simpleParser } = require('mailparser')

interface ConnectionTestResult {
  ok: boolean
  imapOk: boolean
  smtpOk: boolean
  error?: string
}

/**
 * Creates an ImapFlow client instance for the specified account.
 */
function createImapClient(account: any, logger = false) {
  const username = account.imap?.user || account.email
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
function createSmtpTransporter(account: any) {
  const username = account.smtp?.user || account.email
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

// Active IMAP connection pool (1 warm client per account)
const imapPool = new Map<string, any>()
const connectionPromises = new Map<string, Promise<any>>()

/**
 * Get or create an active, authenticated IMAP connection for the account.
 * Reuses the existing open socket (0ms latency instead of 2-3s cold handshake).
 */
async function getConnectedImapClient(account: any) {
  const key = account.id || account.email
  let client = imapPool.get(key)

  if (client && client.usable) {
    return client
  }

  // If a connection attempt is currently in flight for this account, wait for it
  if (connectionPromises.has(key)) {
    return connectionPromises.get(key)
  }

  const connectTask = (async () => {
    try {
      if (client) {
        client.logout().catch(() => {})
        imapPool.delete(key)
      }

      client = createImapClient(account)
      client.on('close', () => {
        imapPool.delete(key)
      })
      client.on('error', () => {
        imapPool.delete(key)
      })

      await client.connect()
      imapPool.set(key, client)
      return client
    } finally {
      connectionPromises.delete(key)
    }
  })()

  connectionPromises.set(key, connectTask)
  return connectTask
}

/**
 * Release a client from the pool (e.g. when account is removed)
 */
function releaseImapClient(accountId: string) {
  const client = imapPool.get(accountId)
  if (client) {
    client.logout().catch(() => {})
    imapPool.delete(accountId)
  }
}

/**
 * Test both IMAP and SMTP connections for an account.
 */
async function testAccountConnection(account: any): Promise<ConnectionTestResult> {
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
    errorMsg = `Falha IMAP (${account.imap?.host}:${account.imap?.port}): ${err?.message || err}`
    return { ok: false, imapOk: false, smtpOk: false, error: errorMsg }
  }

  // 2. Test SMTP
  const transporter = createSmtpTransporter(account)
  try {
    await transporter.verify()
    smtpOk = true
  } catch (err: any) {
    errorMsg = `Falha SMTP (${account.smtp?.host}:${account.smtp?.port}): ${err?.message || err}`
    return { ok: false, imapOk, smtpOk: false, error: errorMsg }
  }

  return { ok: imapOk && smtpOk, imapOk, smtpOk }
}

/**
 * List folders/mailboxes for an account.
 */
async function listMailboxes(account: any) {
  const client = await getConnectedImapClient(account)
  const list = await client.list()
  const validItems = list.filter((item: any) => !(item.flags && item.flags.has('\\Noselect')))

  const folders = await Promise.all(
    validItems.map(async (item: any) => {
      let role = 'custom'
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

      return {
        path: item.path,
        name: item.name,
        role,
        unreadCount: status.unseen || 0,
        totalCount: status.messages || 0
      }
    })
  )

  folders.sort((a, b) => {
    if (a.role === 'inbox') return -1
    if (b.role === 'inbox') return 1
    return a.name.localeCompare(b.name)
  })
  return folders
}

/**
 * Fetch messages list from a mailbox using warm connection.
 */
async function fetchMessages(account: any, folder = 'INBOX', limit = 25, unreadOnly = false) {
  const client = await getConnectedImapClient(account)
  const messages: any[] = []
  const lock = await client.getMailboxLock(folder)
  try {
    const mailbox = client.mailbox
    const count = mailbox.exists || 0
    if (count === 0) return []

    if (unreadOnly) {
      const uids = await client.search({ seen: false }, { uid: true })
      if (!uids || uids.length === 0) return []
      uids.sort((a: number, b: number) => b - a)
      const targetUids = uids.slice(0, limit)
      for await (const msg of client.fetch(
        targetUids.join(','),
        { uid: true, envelope: true, flags: true, bodyStructure: false, size: true },
        { uid: true }
      )) {
        const env = msg.envelope || {}
        const fromAddr = env.from?.[0] || { name: '', address: 'desconhecido@email.com' }
        const toAddrs = (env.to || []).map((t: any) => ({ name: t.name || '', address: t.address || '' }))
        messages.push({
          id: String(msg.uid || msg.seq),
          uid: msg.uid || msg.seq,
          messageId: env.messageId || String(msg.uid || msg.seq),
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
    } else {
      const startSeq = Math.max(1, count - limit + 1)
      const range = `${startSeq}:*`
      for await (const msg of client.fetch(
        range,
        { uid: true, envelope: true, flags: true, bodyStructure: false, size: true },
        { uid: false }
      )) {
        const env = msg.envelope || {}
        const fromAddr = env.from?.[0] || { name: '', address: 'desconhecido@email.com' }
        const toAddrs = (env.to || []).map((t: any) => ({ name: t.name || '', address: t.address || '' }))
        messages.push({
          id: String(msg.uid || msg.seq),
          uid: msg.uid || msg.seq,
          messageId: env.messageId || String(msg.uid || msg.seq),
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
    }
  } finally {
    lock.release()
  }

  messages.sort((a, b) => b.timestamp - a.timestamp)
  return messages
}

/**
 * Fetch full message details including parsed body (HTML/Text) and attachments.
 */
async function fetchFullMessage(account: any, uidOrMessageId: string | number, folder = 'INBOX') {
  const client = await getConnectedImapClient(account)
  const lock = await client.getMailboxLock(folder)
  try {
    const targetUid = typeof uidOrMessageId === 'number' ? uidOrMessageId : parseInt(uidOrMessageId, 10)
    let resolvedUid = targetUid

    if (isNaN(resolvedUid)) {
      const found = await client.search({ header: ['message-id', uidOrMessageId] }, { uid: true })
      if (found && found.length > 0) resolvedUid = found[0]
      else return null
    }

    const download = await client.download(resolvedUid, undefined, { uid: true })
    if (!download || !download.content) return null

    const parsed = await simpleParser(download.content)
    const fromAddr = parsed.from?.value?.[0] || { name: '', address: 'desconhecido' }
    const toAddrs = (parsed.to?.value || []).map((t: any) => ({ name: t.name || '', address: t.address || '' }))
    const ccAddrs = (parsed.cc?.value || []).map((c: any) => ({ name: c.name || '', address: c.address || '' }))
    const bccAddrs = (parsed.bcc?.value || []).map((b: any) => ({ name: b.name || '', address: b.address || '' }))

    let isRead = false
    let isStarred = false
    for await (const msg of client.fetch(String(resolvedUid), { flags: true }, { uid: true })) {
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
}

/**
 * Search emails by query.
 */
async function searchMessages(account: any, query: string, folder = 'INBOX', limit = 20) {
  const client = await getConnectedImapClient(account)
  const messages: any[] = []
  const lock = await client.getMailboxLock(folder)
  try {
    const q = query.trim()
    const searchCriteria: any = {
      or: [{ subject: q }, { from: q }, { to: q }, { body: q }]
    }
    const uids = await client.search(searchCriteria, { uid: true })
    if (!uids || uids.length === 0) return []

    uids.sort((a: number, b: number) => b - a)
    const targetUids = uids.slice(0, limit)

    for await (const msg of client.fetch(
      targetUids.join(','),
      { uid: true, envelope: true, flags: true },
      { uid: true }
    )) {
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
}

/**
 * Send an email via SMTP.
 */
async function sendEmail(account: any, payload: any) {
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
async function setMessageReadStatus(account: any, uid: number, read: boolean, folder = 'INBOX') {
  const client = await getConnectedImapClient(account)
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
}

/**
 * Toggle starred flag on a message.
 */
async function setMessageStarredStatus(account: any, uid: number, starred: boolean, folder = 'INBOX') {
  const client = await getConnectedImapClient(account)
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
}

/**
 * Delete a message.
 */
async function deleteMessage(account: any, uid: number, folder = 'INBOX') {
  const client = await getConnectedImapClient(account)
  const lock = await client.getMailboxLock(folder)
  try {
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
}

/**
 * Move message between mailboxes.
 */
async function moveMessage(account: any, uid: number, fromFolder: string, toFolder: string) {
  const client = await getConnectedImapClient(account)
  const lock = await client.getMailboxLock(fromFolder)
  try {
    await client.messageMove(uid, toFolder, { uid: true })
    return true
  } finally {
    lock.release()
  }
}

module.exports = {
  createImapClient,
  createSmtpTransporter,
  getConnectedImapClient,
  releaseImapClient,
  testAccountConnection,
  listMailboxes,
  fetchMessages,
  fetchFullMessage,
  searchMessages,
  sendEmail,
  setMessageReadStatus,
  setMessageStarredStatus,
  deleteMessage,
  moveMessage
}
