// email-client.ts
// Handles real SMTP (nodemailer) and IMAP (imapflow) operations with mailparser
// Pure CommonJS + erasable TypeScript
// Includes persistent connection pooling to eliminate cold TLS/TCP handshakes

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { exec, execFile } = require('node:child_process')
const { ImapFlow } = require('imapflow')
const nodemailer = require('nodemailer')
const { simpleParser } = require('mailparser')

// Base folder for parsed-message and attachment disk cache. Prefers the
// unified <userData>/cache/extensions/momai-emails/attachments folder and
// falls back to the legacy OS temp dir when no data dir is configured.
let attachmentsBaseOverride: string | null = null

function setAttachmentsBaseDir(dir: string | null) {
  attachmentsBaseOverride = typeof dir === 'string' && dir.length > 0 ? dir : null
}

function getAttachmentsBaseDir(): string {
  if (attachmentsBaseOverride) return attachmentsBaseOverride
  // MOMAI_EXTENSION_CACHE_DIR is mode-scoped (Symlink vs Testar Loja), so
  // cached message bodies never leak across environments.
  const cacheDir = process.env.MOMAI_EXTENSION_CACHE_DIR || ''
  if (cacheDir) return path.join(cacheDir, 'attachments')
  const dataDir =
    process.env.MOMAI_DATA_DIR || process.env.MOMAI_NODE_CORE_DATA_DIR || ''
  if (dataDir) {
    const base = path.basename(dataDir) === 'data' ? path.dirname(dataDir) : dataDir
    return path.join(base, 'app-cache', 'extensions', 'momai-emails', 'cache', 'attachments')
  }
  return path.join(os.tmpdir(), 'momai-emails-attachments')
}

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
 * Start of the unread badge window. Folder badges count only unread messages
 * received inside the recent window so historic backlogs do not inflate them.
 */
const UNREAD_WINDOW_MS = 48 * 60 * 60 * 1000

function normalizeWindowHours(value: any): number {
  return value === 24 ? 24 : 48
}

function getUnreadWindowStart(windowHours?: number): Date {
  const hours = normalizeWindowHours(windowHours ?? 48)
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}

function getStartOfToday(): Date {
  return getUnreadWindowStart()
}

/**
 * Count unread messages received inside the badge window in a single folder.
 * Returns null when the search fails so callers can fall back to STATUS.
 */
async function countUnreadInWindowInFolder(client: any, folderPath: string, windowHours?: number): Promise<number | null> {
  try {
    const lock = await client.getMailboxLock(folderPath)
    try {
      const uids = await client.search({ seen: false, since: getUnreadWindowStart(windowHours) }, { uid: true })
      return Array.isArray(uids) ? uids.length : 0
    } finally {
      lock.release()
    }
  } catch {
    return null
  }
}

async function countUnreadTodayInFolder(client: any, folderPath: string): Promise<number | null> {
  return countUnreadInWindowInFolder(client, folderPath)
}

/**
 * List folders/mailboxes for an account.
 * Badges show only unread messages inside the recent window (SINCE + UNSEEN).
 */
async function listMailboxes(account: any, windowHours?: number) {
  const client = await getConnectedImapClient(account)
  const list = await client.list()
  const validItems = list.filter((item: any) => !(item.flags && item.flags.has('\\Noselect')))

  const folders = await Promise.all(
    validItems.map(async (item: any) => {
      let role = 'custom'
      const special = item.specialUse || ''
      const pathLower = item.path.toLowerCase()
      if (special === '\\Inbox' || pathLower === 'inbox') role = 'inbox'
      else if (special === '\\Important' || pathLower.includes('important') || pathLower.includes('importante')) role = 'important'
      else if (special === '\\Flagged' || pathLower.includes('starred') || pathLower.includes('estrela') || pathLower.includes('favorit')) role = 'starred'
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

  // Sequential window recount: IMAP selects one mailbox at a time,
  // so parallel searches would conflict on the shared connection.
  for (const folder of folders) {
    try {
      const windowCount = await countUnreadInWindowInFolder(client, folder.path, windowHours)
      if (typeof windowCount === 'number') {
        ;(folder as any).totalUnread = folder.unreadCount
        ;(folder as any).unreadToday = windowCount
        ;(folder as any).unreadWindow = windowCount
        folder.unreadCount = windowCount
      }
    } catch {}
  }

  folders.sort((a, b) => {
    if (a.role === 'inbox') return -1
    if (b.role === 'inbox') return 1
    return a.name.localeCompare(b.name)
  })
  return folders
}

/**
 * Get mailbox status (message counts and uidNext) without mailbox lock.
 */
async function getMailboxStatus(account: any, folder = 'INBOX') {
  const client = await getConnectedImapClient(account)
  try {
    const status = await client.status(folder, { messages: true, unseen: true, uidNext: true })
    return {
      ok: true,
      messages: status.messages || 0,
      unseen: status.unseen || 0,
      uidNext: status.uidNext || 0
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err), messages: 0, unseen: 0, uidNext: 0 }
  }
}

/**
 * Helper to traverse ImapFlow bodyStructure tree and extract attachments metadata.
 */
function extractAttachmentsFromBodyStructure(structure: any): any[] {
  const attachments: any[] = []
  if (!structure) return attachments

  function traverse(node: any) {
    if (!node) return
    if (Array.isArray(node.childNodes) && node.childNodes.length > 0) {
      for (const child of node.childNodes) {
        traverse(child)
      }
      return
    }

    const disposition = (node.disposition || '').toLowerCase()
    const rawFilename =
      node.dispositionParameters?.filename ||
      node.parameters?.name ||
      node.parameters?.filename ||
      ''
    const filename = String(rawFilename || '').trim().replace(/^["']|["']$/g, '')

    const type = (node.type || 'application').toLowerCase()
    const subtype = (node.subtype || 'octet-stream').toLowerCase()
    const mimeType = `${type}/${subtype}`

    const isExplicitAttachment = disposition === 'attachment'
    const hasFileName = filename.length > 0
    const isNotStandardBody = mimeType !== 'text/plain' && mimeType !== 'text/html'

    // Consider as attachment if explicit attachment or has a file name and is not plain body
    if (isExplicitAttachment || (hasFileName && (isNotStandardBody || disposition !== 'inline'))) {
      attachments.push({
        id: node.id || (node.part ? String(node.part) : filename),
        part: node.part ? String(node.part) : undefined,
        filename: filename || `anexo-${node.part || '1'}.${subtype}`,
        contentType: mimeType,
        size: typeof node.size === 'number' ? node.size : 0
      })
    }
  }

  traverse(structure)
  return attachments
}

/**
 * Fetch messages list from a mailbox using warm connection.
 * Supports offset-based pagination for infinite scroll.
 */
async function fetchMessages(account: any, folder = 'INBOX', limit = 50, unreadOnly = false, offset = 0) {
  const client = await getConnectedImapClient(account)
  const messages: any[] = []
  const lock = await client.getMailboxLock(folder)
  try {
    // Sincroniza com o servidor IMAP para garantir que client.mailbox.exists reflita mensagens recém-chegadas
    await client.noop().catch(() => {})
    const mailbox = client.mailbox
    const count = mailbox.exists || 0
    if (count === 0) return { messages: [], hasMore: false, total: 0 }

    if (unreadOnly) {
      const uids = await client.search({ seen: false }, { uid: true })
      if (!uids || uids.length === 0) return { messages: [], hasMore: false, total: 0 }
      uids.sort((a: number, b: number) => b - a)
      const targetUids = uids.slice(offset, offset + limit)
      const hasMore = (offset + limit) < uids.length
      for await (const msg of client.fetch(
        targetUids.join(','),
        { uid: true, envelope: true, flags: true, bodyStructure: true, size: true },
        { uid: true }
      )) {
        const env = msg.envelope || {}
        const fromAddr = env.from?.[0] || { name: '', address: 'desconhecido@email.com' }
        const toAddrs = (env.to || []).map((t: any) => ({ name: t.name || '', address: t.address || '' }))
        const atts = extractAttachmentsFromBodyStructure(msg.bodyStructure)
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
          snippet: '',
          hasAttachments: atts.length > 0,
          attachments: atts
        })
      }
      messages.sort((a, b) => b.timestamp - a.timestamp)
      return { messages, hasMore, total: uids.length }
    } else {
      // Calculate range accounting for offset (newest messages first)
      const endSeq = count - offset
      const startSeq = Math.max(1, endSeq - limit + 1)
      if (endSeq < 1) return { messages: [], hasMore: false, total: count }

      const range = `${startSeq}:${endSeq}`
      for await (const msg of client.fetch(
        range,
        { uid: true, envelope: true, flags: true, bodyStructure: true, size: true },
        { uid: false }
      )) {
        const env = msg.envelope || {}
        const fromAddr = env.from?.[0] || { name: '', address: 'desconhecido@email.com' }
        const toAddrs = (env.to || []).map((t: any) => ({ name: t.name || '', address: t.address || '' }))
        const atts = extractAttachmentsFromBodyStructure(msg.bodyStructure)
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
          snippet: '',
          hasAttachments: atts.length > 0,
          attachments: atts
        })
      }
      const hasMore = startSeq > 1
      messages.sort((a, b) => b.timestamp - a.timestamp)
      return { messages, hasMore, total: count }
    }
  } finally {
    lock.release()
  }
}

/**
 * Generates a real PNG thumbnail of the first page/sheet of a document (PDF, DOCX, XLSX, etc.)
 * using native Windows WinRT and Office headless automation.
 */
async function generateDocumentThumbnail(docPath: string, width = 400): Promise<string | null> {
  if (process.platform !== 'win32') return null
  if (!docPath || !fs.existsSync(docPath)) return null

  const thumbPath = `${docPath}.thumb.png`
  if (fs.existsSync(thumbPath)) {
    try {
      const st = fs.statSync(thumbPath)
      if (st.size > 0) {
        const buf = fs.readFileSync(thumbPath)
        return `data:image/png;base64,${buf.toString('base64')}`
      }
    } catch {}
  }

  const ext = path.extname(docPath).toLowerCase()
  const isPdf = ext === '.pdf'
  const isOffice = ['.docx', '.doc', '.rtf', '.odt', '.xlsx', '.xls', '.csv'].includes(ext)

  if (!isPdf && !isOffice) return null

  const scriptName = isPdf ? 'render-pdf-thumb.ps1' : 'render-office-thumb.ps1'
  const scriptCandidates = [
    path.join(__dirname, 'scripts', scriptName),
    path.join(__dirname, '..', 'scripts', scriptName),
    path.join(process.cwd(), 'scripts', scriptName)
  ]
  const scriptPath = scriptCandidates.find((p) => fs.existsSync(p))
  if (!scriptPath) {
    console.warn(`[momai-emails] ${scriptName} não encontrado`)
    return null
  }

  return new Promise((resolve) => {
    const args = isPdf
      ? [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-PdfPath',
          docPath,
          '-PngPath',
          thumbPath,
          '-Width',
          String(width)
        ]
      : [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-DocPath',
          docPath,
          '-OutPngPath',
          thumbPath
        ]

    execFile('powershell.exe', args, { timeout: 25000 }, (err: any) => {
      if (err) {
        console.warn(`[momai-emails] Falha ao renderizar thumb de ${ext}:`, err?.message || err)
        return resolve(null)
      }
      try {
        if (fs.existsSync(thumbPath)) {
          const buf = fs.readFileSync(thumbPath)
          if (buf.length > 0) {
            return resolve(`data:image/png;base64,${buf.toString('base64')}`)
          }
        }
      } catch {}
      resolve(null)
    })
  })
}

const generatePdfThumbnail = generateDocumentThumbnail

/**
 * Fetch full message details including parsed body (HTML/Text) and attachments.
 */
async function fetchFullMessage(account: any, uidOrMessageId: string | number, folder = 'INBOX') {
  const accKey = String(account.email || account.id || 'default').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_')
  const targetUidNum = typeof uidOrMessageId === 'number' ? uidOrMessageId : parseInt(String(uidOrMessageId), 10)

  // 0ms Disk Cache: If message was parsed and cached before, return immediately without network overhead
  if (!isNaN(targetUidNum)) {
    const quickCacheBaseDir = path.join(getAttachmentsBaseDir(), accKey, String(targetUidNum))
    const quickMetaFile = path.join(quickCacheBaseDir, 'message_parsed.json')
    if (fs.existsSync(quickMetaFile)) {
      try {
        const cachedJson = JSON.parse(fs.readFileSync(quickMetaFile, 'utf8'))
        if (cachedJson && cachedJson.id) {
          return cachedJson
        }
      } catch {}
    }
  }

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

    const cacheBaseDir = path.join(getAttachmentsBaseDir(), accKey, String(resolvedUid))
    const metaFile = path.join(cacheBaseDir, 'message_parsed.json')
    if (fs.existsSync(metaFile)) {
      try {
        const cachedJson = JSON.parse(fs.readFileSync(metaFile, 'utf8'))
        if (cachedJson && cachedJson.id) {
          return cachedJson
        }
      } catch {}
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

    try {
      if (!fs.existsSync(cacheBaseDir)) fs.mkdirSync(cacheBaseDir, { recursive: true })
    } catch {}

    const attachments: any[] = []
    for (const att of (parsed.attachments || [])) {
      const filename = att.filename || 'anexo'
      const cleanName = path.basename(filename)
      let localPath: string | undefined
      let previewDataUrl: string | undefined
      let base64Data: string | undefined

      const filePath = path.join(cacheBaseDir, cleanName)

      if (att.content && Buffer.isBuffer(att.content)) {
        try {
          fs.writeFileSync(filePath, att.content)
          localPath = filePath
        } catch {}

        const mime = (att.contentType || '').toLowerCase()
        const ext = path.extname(filename).toLowerCase()

        if (mime.startsWith('image/')) {
          previewDataUrl = `data:${att.contentType};base64,${att.content.toString('base64')}`
        } else if (
          ext === '.pdf' ||
          mime.includes('pdf') ||
          ['.docx', '.doc', '.rtf', '.odt', '.xlsx', '.xls', '.csv'].includes(ext) ||
          mime.includes('word') ||
          mime.includes('spreadsheet') ||
          mime.includes('excel')
        ) {
          if (att.content.length <= 15 * 1024 * 1024 && (ext === '.pdf' || mime.includes('pdf'))) {
            base64Data = att.content.toString('base64')
          }
          if (localPath) {
            try {
              const docThumb = await generateDocumentThumbnail(localPath, 400)
              if (docThumb) {
                previewDataUrl = docThumb
              }
            } catch (err) {
              console.warn('[momai-emails] Erro ao gerar thumbnail de documento:', err)
            }
          }
        }
      } else if (fs.existsSync(filePath)) {
        localPath = filePath
        const ext = path.extname(filename).toLowerCase()
        if (['.pdf', '.docx', '.doc', '.rtf', '.odt', '.xlsx', '.xls', '.csv'].includes(ext)) {
          try {
            const docThumb = await generateDocumentThumbnail(localPath, 400)
            if (docThumb) previewDataUrl = docThumb
          } catch {}
        }
      }

      attachments.push({
        id: att.cid || filename,
        filename,
        contentType: att.contentType || 'application/octet-stream',
        size: att.size || (att.content ? att.content.length : 0),
        contentId: att.cid,
        localPath,
        previewDataUrl,
        base64Data
      })
    }

    const resultEmail = {
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

    try {
      fs.writeFileSync(path.join(cacheBaseDir, 'message_parsed.json'), JSON.stringify(resultEmail), 'utf8')
    } catch {}

    return resultEmail
  } finally {
    lock.release()
  }
}

/**
 * Search emails by query on the IMAP server (server-side, searches ALL messages).
 */
async function searchMessages(account: any, query: string, folder = 'INBOX', limit = 200) {
  const client = await getConnectedImapClient(account)
  const messages: any[] = []
  const lock = await client.getMailboxLock(folder)
  try {
    const q = query.trim()
    const searchCriteria: any = {
      or: [{ subject: q }, { from: q }, { to: q }, { body: q }]
    }
    const uids = await client.search(searchCriteria, { uid: true })
    if (!uids || uids.length === 0) return { messages: [], total: 0 }

    uids.sort((a: number, b: number) => b - a)
    const targetUids = uids.slice(0, limit)

    for await (const msg of client.fetch(
      targetUids.join(','),
      { uid: true, envelope: true, flags: true, bodyStructure: true },
      { uid: true }
    )) {
      const env = msg.envelope || {}
      const fromAddr = env.from?.[0] || { name: '', address: '' }
      const toAddrs = (env.to || []).map((t: any) => ({ name: t.name || '', address: t.address || '' }))
      const atts = extractAttachmentsFromBodyStructure(msg.bodyStructure)
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
        snippet: '',
        hasAttachments: atts.length > 0,
        attachments: atts
      })
    }
  } finally {
    lock.release()
  }
  messages.sort((a, b) => b.timestamp - a.timestamp)
  return { messages, total: messages.length }
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

    if (Array.isArray(payload.attachments) && payload.attachments.length > 0) {
      mailOptions.attachments = payload.attachments.map((att: any) => {
        const item: any = {
          filename: att.filename || 'anexo'
        }
        if (att.contentType) item.contentType = att.contentType
        if (att.content) {
          const raw = typeof att.content === 'string' && att.content.includes(';base64,')
            ? att.content.split(';base64,')[1]
            : att.content
          item.content = Buffer.from(raw, 'base64')
        } else if (att.base64Data) {
          const raw = typeof att.base64Data === 'string' && att.base64Data.includes(';base64,')
            ? att.base64Data.split(';base64,')[1]
            : att.base64Data
          item.content = Buffer.from(raw, 'base64')
        } else if (att.path || att.localPath) {
          item.path = att.path || att.localPath
        }
        if (att.cid || att.contentId) item.cid = att.cid || att.contentId
        return item
      })
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

/**
 * Downloads a specific attachment from an email and saves it to a persistent temp folder.
 * If already downloaded, returns the cached file path immediately (0ms).
 */
async function downloadAttachmentToFile(
  account: any,
  uidOrMessageId: string | number,
  folder = 'INBOX',
  filename?: string,
  part?: string
): Promise<string | null> {
  const accKey = String(account.email || account.id || 'default').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_')
  const resolvedUidStr = String(uidOrMessageId)
  const cacheBaseDir = path.join(getAttachmentsBaseDir(), accKey, resolvedUidStr)

  try {
    if (!fs.existsSync(cacheBaseDir)) fs.mkdirSync(cacheBaseDir, { recursive: true })
  } catch {}

  // Check if file is already cached
  if (filename) {
    const cleanName = path.basename(filename)
    const cachedFile = path.join(cacheBaseDir, cleanName)
    if (fs.existsSync(cachedFile)) {
      const st = fs.statSync(cachedFile)
      if (st.size > 0) return cachedFile
    }
  }

  const client = await getConnectedImapClient(account)
  const lock = await client.getMailboxLock(folder)
  try {
    const targetUid = typeof uidOrMessageId === 'number' ? uidOrMessageId : parseInt(String(uidOrMessageId), 10)
    let resolvedUid = targetUid

    if (isNaN(resolvedUid)) {
      const found = await client.search({ header: ['message-id', uidOrMessageId] }, { uid: true })
      if (found && found.length > 0) resolvedUid = found[0]
      else return null
    }

    const download = await client.download(resolvedUid, undefined, { uid: true })
    if (!download || !download.content) return null

    const parsed = await simpleParser(download.content)
    let matchedPath: string | null = null

    for (const att of parsed.attachments || []) {
      const attName = att.filename || 'anexo'
      const cleanAttName = path.basename(attName)
      const savePath = path.join(cacheBaseDir, cleanAttName)
      if (att.content && Buffer.isBuffer(att.content)) {
        fs.writeFileSync(savePath, att.content)
      }

      const ext = path.extname(cleanAttName).toLowerCase()
      if (['.pdf', '.docx', '.doc', '.rtf', '.odt', '.xlsx', '.xls', '.csv'].includes(ext) && fs.existsSync(savePath)) {
        generateDocumentThumbnail(savePath, 400).catch(() => {})
      }

      if (!matchedPath) {
        if (!filename || cleanAttName.toLowerCase() === path.basename(filename).toLowerCase()) {
          matchedPath = savePath
        }
      }
    }

    if (!matchedPath && (parsed.attachments || []).length > 0) {
      const firstAtt = parsed.attachments[0]
      const firstPath = path.join(cacheBaseDir, path.basename(firstAtt.filename || 'anexo'))
      if (fs.existsSync(firstPath)) matchedPath = firstPath
    }

    return matchedPath
  } finally {
    lock.release()
  }
}

/**
 * Opens a local document file using the operating system's default viewer/application
 * (e.g. Word for .docx, Excel for .xlsx, Acrobat/browser for .pdf).
 */
function openFileWithDefaultApp(filePath: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  return new Promise((resolve) => {
    const normalized = path.resolve(String(filePath).trim())
    if (!fs.existsSync(normalized)) {
      return resolve({ ok: false, error: 'Arquivo não encontrado no disco local.' })
    }

    // Windows: 'start "" "filepath"' safely handles spaces and launches the default shell program
    const cmd = process.platform === 'win32'
      ? `start "" "${normalized}"`
      : process.platform === 'darwin'
        ? `open "${normalized}"`
        : `xdg-open "${normalized}"`

    exec(cmd, (err: any) => {
      if (err) {
        console.error('[momai-emails] Erro ao abrir arquivo no sistema:', err)
        return resolve({ ok: false, error: err?.message || String(err) })
      }
      return resolve({ ok: true, path: normalized })
    })
  })
}

/**
 * Prompts the user with a native Windows SaveFileDialog (via PowerShell) to choose
 * where to save the attachment file. If confirmed, copies the file to the chosen path.
 */
function saveAttachmentWithDialog(sourceFilePath: string, suggestedName?: string): Promise<{ ok: boolean; savedPath?: string; cancelled?: boolean; error?: string }> {
  return new Promise((resolve) => {
    const normalized = path.resolve(String(sourceFilePath).trim())
    if (!fs.existsSync(normalized)) {
      return resolve({ ok: false, error: 'Arquivo fonte não encontrado no disco local.' })
    }

    const scriptPath = path.join(__dirname, 'scripts', 'save-attachment-dialog.ps1')
    const fileName = suggestedName ? path.basename(suggestedName) : path.basename(normalized)

    if (process.platform === 'win32' && fs.existsSync(scriptPath)) {
      const args = [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-SourcePath',
        normalized,
        '-InitialFileName',
        fileName
      ]

      execFile('powershell.exe', args, { windowsHide: true }, (err: any, stdout: string, stderr: string) => {
        if (err) {
          console.error('[momai-emails] Erro no diálogo de salvar anexo:', err, stderr)
          return resolve({ ok: false, error: stderr || err?.message || 'Falha ao abrir diálogo de salvamento.' })
        }

        const out = String(stdout).trim()
        if (out.startsWith('SAVED:')) {
          const destPath = out.slice('SAVED:'.length).trim()
          return resolve({ ok: true, savedPath: destPath })
        } else if (out.includes('CANCELLED')) {
          return resolve({ ok: true, cancelled: true })
        }

        return resolve({ ok: false, error: out || 'Operação cancelada ou sem resposta.' })
      })
    } else {
      // Fallback non-Windows or if script missing: copy to user's Downloads directory
      try {
        const downloadsDir = path.join(os.homedir(), 'Downloads')
        if (!fs.existsSync(downloadsDir)) {
          fs.mkdirSync(downloadsDir, { recursive: true })
        }
        let targetPath = path.join(downloadsDir, fileName)
        let counter = 1
        const ext = path.extname(fileName)
        const nameWithoutExt = path.basename(fileName, ext)
        while (fs.existsSync(targetPath)) {
          targetPath = path.join(downloadsDir, `${nameWithoutExt} (${counter})${ext}`)
          counter++
        }
        fs.copyFileSync(normalized, targetPath)
        return resolve({ ok: true, savedPath: targetPath })
      } catch (copyErr: any) {
        return resolve({ ok: false, error: copyErr?.message || String(copyErr) })
      }
    }
  })
}

module.exports = {
  createImapClient,
  createSmtpTransporter,
  getConnectedImapClient,
  releaseImapClient,
  testAccountConnection,
  listMailboxes,
  getMailboxStatus,
  fetchMessages,
  fetchFullMessage,
  searchMessages,
  sendEmail,
  setMessageReadStatus,
  setMessageStarredStatus,
  deleteMessage,
  moveMessage,
  downloadAttachmentToFile,
  openFileWithDefaultApp,
  saveAttachmentWithDialog,
  generatePdfThumbnail,
  generateDocumentThumbnail,
  getAttachmentsBaseDir,
  setAttachmentsBaseDir,
  getStartOfToday,
  countUnreadTodayInFolder,
  getUnreadWindowStart,
  countUnreadInWindowInFolder
}
