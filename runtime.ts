// runtime.ts
// MomAI E-mails persistent background worker
// Handles IPC execution, tool execution for Assistant, automations, and event dispatch

const path = require('node:path')
const fs = require('node:fs')

// ---------- Locale helpers (inline, no external deps) ----------
const _WORKER_LOCALE = (() => {
  const raw = (process.env.MOMAI_LOCALE || '').trim().toLowerCase()
  if (raw.startsWith('en')) return 'en-US'
  return 'pt-BR'
})()

const _WORKER_STRINGS = {
  'pt-BR': {
    notifications_newEmail: 'Novo e-mail',
    notifications_unknownSender: 'Desconhecido',
    notifications_noSubject: '(Sem assunto)',
    reply_originalHeader: '--- Mensagem Original ---',
    reply_from: 'De',
    reply_date: 'Data',
    forward_header: '---------- Mensagem Encaminhada ----------',
    forward_from: 'De',
    forward_date: 'Data',
    forward_subject: 'Assunto',
    forward_to: 'Para'
  },
  'en-US': {
    notifications_newEmail: 'New email',
    notifications_unknownSender: 'Unknown',
    notifications_noSubject: '(No subject)',
    reply_originalHeader: '--- Original Message ---',
    reply_from: 'From',
    reply_date: 'Date',
    forward_header: '---------- Forwarded Message ----------',
    forward_from: 'From',
    forward_date: 'Date',
    forward_subject: 'Subject',
    forward_to: 'To'
  }
}

function _wtr(key) {
  return (_WORKER_STRINGS[_WORKER_LOCALE] || _WORKER_STRINGS['pt-BR'])[key] || key
}

function safeSend(msg: any) {
  try {
    if (typeof process.send === 'function') process.send(msg)
  } catch (err: any) {
    console.warn('[runtime:momai-emails] IPC send error:', err?.message || err)
  }
}

process.on('uncaughtException', (err) => {
  console.error('[runtime:momai-emails] Uncaught exception:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[runtime:momai-emails] Unhandled rejection:', reason)
})

const { AccountManager } = require('./account-manager.ts')
const { classifyEmailCategory, shouldNotifyForCategory } = require('./email-categories.ts')
const {
  testAccountConnection,
  listMailboxes,
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
  generateDocumentThumbnail
} = require('./email-client.ts')

const accountManager = new AccountManager()

// Setup event emission on new emails
accountManager.setOnNewEmail(({ accountId, email, totalUnread }: any) => {
  try {
    const fromStr = email.from ? (email.from.name ? `${email.from.name} <${email.from.address}>` : email.from.address) : _wtr('notifications_unknownSender')
    const toStr = Array.isArray(email.to) ? email.to.map((t: any) => t.address || t.name).join(', ') : ''

    const category = classifyEmailCategory({ from: email.from, subject: email.subject })
    const wantsNotice = shouldNotifyForCategory(category, accountManager.getNotificationPrefs().primaryOnly)

    // 1. Emit general new_email event (always: drives list refresh and automations)
    safeSend({
      type: 'event',
      eventType: 'new_email',
      data: {
        accountId,
        from: fromStr,
        to: toStr,
        subject: email.subject || _wtr('notifications_noSubject'),
        snippet: email.snippet || '',
        date: email.date,
        messageId: email.messageId || email.id,
        category
      }
    })

    // 2. Emit email_matching_filter event
    safeSend({
      type: 'event',
      eventType: 'email_matching_filter',
      data: {
        from: fromStr,
        subject: email.subject || '',
        containsKeyword: email.snippet || '',
        messageId: email.messageId || email.id
      }
    })

    // Promotions, Social and Updates stay silent when Primary-only mode is on.
    if (!wantsNotice) return

    // 3. Emit badge_update so sidebar lights up with clean red dot (no numbers)
    safeSend({
      type: 'event',
      eventType: 'badge_update',
      data: {
        extensionId: 'momai-emails',
        count: true
      }
    })

    // 4. Emit native OS notification directly from background worker
    const senderName =
      email.from && typeof email.from === 'object'
        ? email.from.name || email.from.address || _wtr('notifications_newEmail')
        : email.from || _wtr('notifications_newEmail')

    safeSend({
      type: 'event',
      eventType: 'notification',
      data: {
        title: senderName,
        body: email.subject || _wtr('notifications_noSubject'),
        action: 'momai-emails:open'
      }
    })
  } catch (err: any) {
    console.warn('[runtime:momai-emails] Failed to emit email event:', err?.message || err)
  }
})

// Periodic heartbeat to NodeCore health monitor (every 30s) to prevent worker timeout/SIGTERM
setInterval(() => {
  safeSend({ type: 'heartbeat', timestamp: Date.now() })
}, 30000)

// Immediately emit ready to host-manager so the persistent worker is marked active without delay
safeSend({ type: 'ready' })

// Initialize manager on startup in background
accountManager.initialize().catch((err: any) => {
  console.error('[runtime:momai-emails] Init failed:', err)
})

/**
 * Tool & Command Dispatcher
 */
async function executeTool(toolName: string, args: any = {}): Promise<any> {
  switch (toolName) {
    case 'command': {
      const actualTool = args?.toolName || args?.tool
      const actualArgs = args?.args || args
      if (actualTool && actualTool !== 'command') {
        return executeTool(actualTool, actualArgs)
      }
      return { ok: false, error: 'Ferramenta ausente no comando.' }
    }

    // ── Account Management ──
    case 'list_accounts': {
      const accounts = accountManager.getPublicAccounts()
      return {
        ok: true,
        accounts,
        total: accounts.length,
        instruction: accounts.length === 0
          ? 'Nenhuma conta de e-mail cadastrada.'
          : `${accounts.length} conta(s) cadastrada(s).`,
        directResponse: accounts.length === 0
          ? 'Nenhuma conta de e-mail está conectada no momento.'
          : `Contas disponíveis: ${accounts.map((a: any) => `${a.name} (${a.email})`).join(', ')}`
      }
    }

    case 'add_account': {
      const res = await accountManager.addOrUpdateAccount(args)
      if (res.ok) {
        safeSend({
          type: 'event',
          eventType: 'account_status_changed',
          data: { accountId: res.account?.id, status: 'connected' }
        })
      }
      return res
    }

    case 'remove_account': {
      const ok = await accountManager.removeAccount(args.id || args.accountId)
      return { ok }
    }

    case 'set_active_account': {
      const ok = accountManager.setActiveAccount(args.id || args.accountId)
      return { ok }
    }

    case 'test_account': {
      const tempAcc = {
        email: args.email,
        password: (args.password || '').replace(/\s+/g, ''),
        imap: args.imap,
        smtp: args.smtp
      }
      const test = await testAccountConnection(tempAcc)
      return test
    }

    // ── Folders & Mailboxes ──
    case 'list_folders': {
      const account = accountManager.getAccount(args.accountId)
      if (!account) return { ok: false, error: 'Nenhuma conta de e-mail configurada.' }
      try {
        const windowHours = accountManager.getNotificationPrefs().unreadWindowHours
        const folders = await listMailboxes(account, windowHours)
        return { ok: true, folders }
      } catch (err: any) {
        return { ok: false, error: err?.message || String(err) }
      }
    }

    // ── Emails ──
    case 'list_emails': {
      const account = accountManager.getAccount(args.accountId)
      if (!account) return { ok: false, error: 'Nenhuma conta de e-mail encontrada.' }
      try {
        const folder = args.folder || 'INBOX'
        const limit = typeof args.limit === 'number' ? args.limit : 50
        const offset = typeof args.offset === 'number' ? args.offset : 0
        const unreadOnly = Boolean(args.unreadOnly)
        const result = await fetchMessages(account, folder, limit, unreadOnly, offset)
        return {
          ok: true,
          folder,
          messages: result.messages,
          total: result.total,
          hasMore: result.hasMore,
          instruction: `Encontrados ${result.messages.length} e-mails na pasta ${folder} (total: ${result.total}).`,
          directResponse: result.messages.length === 0
            ? `Nenhum e-mail recente na pasta ${folder}.`
            : `Aqui estão os ${result.messages.length} e-mails mais recentes de ${account.email}:\n` +
              result.messages.slice(0, 5).map((m: any) => `- ${_wtr('reply_from')}: ${m.from?.name || m.from?.address} | ${_wtr('forward_subject')}: "${m.subject}"`).join('\n')
        }
      } catch (err: any) {
        return { ok: false, error: err?.message || String(err) }
      }
    }

    case 'read_email': {
      const account = accountManager.getAccount(args.accountId)
      if (!account) return { ok: false, error: 'Nenhuma conta de e-mail encontrada.' }
      try {
        const messageId = args.messageId || args.id || args.uid
        const folder = args.folder || 'INBOX'
        const email = await fetchFullMessage(account, messageId, folder)
        if (!email) return { ok: false, error: 'E-mail não encontrado.' }

        // Mark as read automatically when opened, unless the reader opted out
        if (args.markRead !== false) {
          setMessageReadStatus(account, email.uid, true, folder).catch(() => {})
        }

        return {
          ok: true,
          email,
          instruction: `E-mail de ${email.from.name || email.from.address}: "${email.subject}".`,
          directResponse: `${_wtr('forward_subject')}: ${email.subject}\n${_wtr('reply_from')}: ${email.from.name || email.from.address}\n${_wtr('reply_date')}: ${email.date}\n\n${email.text || email.snippet || '(No text content)'}`
        }
      } catch (err: any) {
        return { ok: false, error: err?.message || String(err) }
      }
    }

    case 'open_attachment': {
      const account = accountManager.getAccount(args.accountId)
      if (!account) return { ok: false, error: 'Nenhuma conta de e-mail encontrada.' }
      try {
        const messageId = args.messageId || args.id || args.uid
        const folder = args.folder || 'INBOX'
        const filename = args.filename
        const part = args.part

        const filePath = await downloadAttachmentToFile(account, messageId, folder, filename, part)
        if (!filePath) {
          return { ok: false, error: 'Não foi possível baixar o documento anexo.' }
        }

        const openRes = await openFileWithDefaultApp(filePath)
        if (!openRes.ok) {
          return { ok: false, error: openRes.error || 'Falha ao abrir documento no computador.' }
        }

        const resolvedName = path.basename(filePath)
        return {
          ok: true,
          path: openRes.path,
          filename: resolvedName,
          instruction: `Documento "${resolvedName}" aberto com sucesso no computador.`,
          directResponse: `O documento "${resolvedName}" foi aberto com o aplicativo padrão do seu computador.`
        }
      } catch (err: any) {
        return { ok: false, error: err?.message || String(err) }
      }
    }

    case 'save_attachment': {
      const account = accountManager.getAccount(args.accountId)
      if (!account) return { ok: false, error: 'Nenhuma conta de e-mail encontrada.' }
      try {
        const messageId = args.messageId || args.id || args.uid
        const folder = args.folder || 'INBOX'
        const filename = args.filename
        const part = args.part

        const filePath = await downloadAttachmentToFile(account, messageId, folder, filename, part)
        if (!filePath) {
          return { ok: false, error: 'Não foi possível baixar o documento anexo.' }
        }

        const saveRes = await saveAttachmentWithDialog(filePath, filename)
        if (!saveRes.ok) {
          return { ok: false, error: saveRes.error || 'Falha ao salvar anexo.' }
        }

        if (saveRes.cancelled) {
          return { ok: true, cancelled: true, instruction: 'Salvamento cancelado pelo usuário.' }
        }

        const resolvedName = path.basename(saveRes.savedPath || filePath)
        return {
          ok: true,
          savedPath: saveRes.savedPath,
          filename: resolvedName,
          instruction: `Documento "${resolvedName}" salvo com sucesso em "${saveRes.savedPath}".`,
          directResponse: `O documento "${resolvedName}" foi salvo com sucesso em:\n${saveRes.savedPath}`
        }
      } catch (err: any) {
        return { ok: false, error: err?.message || String(err) }
      }
    }

    case 'get_attachment_preview': {
      const account = accountManager.getAccount(args.accountId)
      if (!account) return { ok: false, error: 'Conta não encontrada.' }
      try {
        const messageId = args.messageId || args.id || args.uid
        const folder = args.folder || 'INBOX'
        const filename = args.filename
        const filePath = await downloadAttachmentToFile(account, messageId, folder, filename)
        if (!filePath) return { ok: false, error: 'Arquivo anexo não encontrado.' }

        let previewDataUrl: string | null = null
        const ext = path.extname(filePath).toLowerCase()
        if (['.pdf', '.docx', '.doc', '.rtf', '.odt', '.xlsx', '.xls', '.csv'].includes(ext)) {
          previewDataUrl = await generateDocumentThumbnail(filePath, 400)
        } else if (/\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(filePath)) {
          const buf = fs.readFileSync(filePath)
          const imgExt = ext.slice(1)
          previewDataUrl = `data:image/${imgExt === 'jpg' ? 'jpeg' : imgExt};base64,${buf.toString('base64')}`
        }
        return { ok: true, previewDataUrl, filePath }
      } catch (err: any) {
        return { ok: false, error: err?.message || String(err) }
      }
    }

    case 'search_emails': {
      const account = accountManager.getAccount(args.accountId)
      if (!account) return { ok: false, error: 'Nenhuma conta de e-mail encontrada.' }
      try {
        const query = args.query || ''
        const folder = args.folder || 'INBOX'
        const limit = typeof args.limit === 'number' ? args.limit : 200
        const result = await searchMessages(account, query, folder, limit)
        return {
          ok: true,
          query,
          messages: result.messages,
          total: result.total,
          instruction: `Busca por "${query}" retornou ${result.total} e-mail(s).`,
          directResponse: result.total === 0
            ? `Nenhum e-mail encontrado para o termo "${query}".`
            : `Encontrados ${result.total} e-mails para "${query}":\n` +
              result.messages.slice(0, 10).map((m: any) => `- ${_wtr('reply_from')}: ${m.from?.name || m.from?.address} | ${_wtr('forward_subject')}: "${m.subject}"`).join('\n')
        }
      } catch (err: any) {
        return { ok: false, error: err?.message || String(err) }
      }
    }

    case 'send_email': {
      const account = accountManager.getAccount(args.accountId)
      if (!account) return { ok: false, error: 'Nenhuma conta de e-mail configurada para envio.' }
      try {
        const result = await sendEmail(account, {
          to: args.to,
          subject: args.subject,
          body: args.body,
          isHtml: Boolean(args.isHtml),
          cc: args.cc,
          bcc: args.bcc,
          inReplyTo: args.inReplyTo,
          references: args.references,
          attachments: args.attachments
        })
        if (result.ok) {
          safeSend({
            type: 'event',
            eventType: 'email_sent',
            data: {
              accountId: account.id,
              to: args.to,
              subject: args.subject,
              messageId: result.messageId
            }
          })
          return {
            ok: true,
            messageId: result.messageId,
            instruction: `E-mail enviado com sucesso para ${args.to}.`,
            directResponse: `E-mail enviado com sucesso para ${args.to} com o assunto "${args.subject}".`
          }
        }
        return { ok: false, error: result.error }
      } catch (err: any) {
        return { ok: false, error: err?.message || String(err) }
      }
    }

    case 'reply_email': {
      const account = accountManager.getAccount(args.accountId)
      if (!account) return { ok: false, error: 'Nenhuma conta de e-mail configurada.' }
      try {
        const origEmail = await fetchFullMessage(account, args.messageId, args.folder || 'INBOX')
        if (!origEmail) return { ok: false, error: 'E-mail original não encontrado para resposta.' }

        const replyToAddress = origEmail.replyTo?.[0]?.address || origEmail.from.address
        const subject = origEmail.subject.startsWith('Re:') ? origEmail.subject : `Re: ${origEmail.subject}`

        let replyCc: string | undefined
        if (args.replyAll && origEmail.cc && origEmail.cc.length > 0) {
          replyCc = origEmail.cc.map((c: any) => c.address).filter((addr: string) => addr !== account.email).join(', ')
        }

        const formattedBody = args.body + `\n\n${_wtr('reply_originalHeader')}\n${_wtr('reply_from')}: ${origEmail.from.name || origEmail.from.address}\n${_wtr('reply_date')}: ${origEmail.date}\n\n${origEmail.text || origEmail.snippet}`

        const result = await sendEmail(account, {
          to: replyToAddress,
          subject,
          body: formattedBody,
          isHtml: Boolean(args.isHtml),
          cc: replyCc,
          inReplyTo: origEmail.messageId,
          references: origEmail.messageId
        })

        if (result.ok) {
          return {
            ok: true,
            messageId: result.messageId,
            instruction: `Resposta enviada para ${replyToAddress}.`,
            directResponse: `Resposta enviada com sucesso para ${replyToAddress}.`
          }
        }
        return { ok: false, error: result.error }
      } catch (err: any) {
        return { ok: false, error: err?.message || String(err) }
      }
    }

    case 'forward_email': {
      const account = accountManager.getAccount(args.accountId)
      if (!account) return { ok: false, error: 'Nenhuma conta de e-mail configurada.' }
      try {
        const origEmail = await fetchFullMessage(account, args.messageId, args.folder || 'INBOX')
        if (!origEmail) return { ok: false, error: 'E-mail original não encontrado para encaminhamento.' }

        const subject = origEmail.subject.startsWith('Fwd:') || origEmail.subject.startsWith('Enc:')
          ? origEmail.subject
          : `Fwd: ${origEmail.subject}`

        const comment = args.comment ? `${args.comment}\n\n` : ''
        const formattedBody = `${comment}${_wtr('forward_header')}\n${_wtr('forward_from')}: ${origEmail.from.name || origEmail.from.address}\n${_wtr('forward_date')}: ${origEmail.date}\n${_wtr('forward_subject')}: ${origEmail.subject}\n${_wtr('forward_to')}: ${origEmail.to.map((t: any) => t.address).join(', ')}\n\n${origEmail.text || origEmail.snippet}`

        const result = await sendEmail(account, {
          to: args.to,
          subject,
          body: formattedBody,
          isHtml: false
        })

        if (result.ok) {
          return {
            ok: true,
            messageId: result.messageId,
            instruction: `E-mail encaminhado com sucesso para ${args.to}.`,
            directResponse: `E-mail "${origEmail.subject}" encaminhado para ${args.to}.`
          }
        }
        return { ok: false, error: result.error }
      } catch (err: any) {
        return { ok: false, error: err?.message || String(err) }
      }
    }

    case 'mark_as_read': {
      const account = accountManager.getAccount(args.accountId)
      if (!account) return { ok: false, error: 'Conta não encontrada.' }
      const uid = parseInt(args.messageId || args.uid, 10)
      const ok = await setMessageReadStatus(account, uid, true, args.folder || 'INBOX')
      if (ok) {
        accountManager.checkAllAccountsForNewEmails().catch(() => {})
        const currentUnread = accountManager.getTotalUnreadCount()
        const hasUnread = currentUnread > 1
        safeSend({
          type: 'event',
          eventType: 'badge_update',
          data: { extensionId: 'momai-emails', count: hasUnread }
        })
      }
      return { ok, instruction: 'E-mail marcado como lido.' }
    }

    case 'mark_as_unread': {
      const account = accountManager.getAccount(args.accountId)
      if (!account) return { ok: false, error: 'Conta não encontrada.' }
      const uid = parseInt(args.messageId || args.uid, 10)
      const ok = await setMessageReadStatus(account, uid, false, args.folder || 'INBOX')
      if (ok) {
        accountManager.checkAllAccountsForNewEmails().catch(() => {})
        safeSend({
          type: 'event',
          eventType: 'badge_update',
          data: { extensionId: 'momai-emails', count: true }
        })
      }
      return { ok, instruction: 'E-mail marcado como não lido.' }
    }

    case 'toggle_starred': {
      const account = accountManager.getAccount(args.accountId)
      if (!account) return { ok: false, error: 'Conta não encontrada.' }
      const uid = parseInt(args.messageId || args.uid, 10)
      const ok = await setMessageStarredStatus(account, uid, Boolean(args.starred), args.folder || 'INBOX')
      return { ok }
    }

    case 'delete_email': {
      const account = accountManager.getAccount(args.accountId)
      if (!account) return { ok: false, error: 'Conta não encontrada.' }
      const uid = parseInt(args.messageId || args.uid, 10)
      const ok = await deleteMessage(account, uid, args.folder || 'INBOX')
      return { ok, instruction: 'E-mail excluído com sucesso.' }
    }

    case 'move_email': {
      const account = accountManager.getAccount(args.accountId)
      if (!account) return { ok: false, error: 'Conta não encontrada.' }
      const uid = parseInt(args.messageId || args.uid, 10)
      const ok = await moveMessage(account, uid, args.fromFolder || 'INBOX', args.toFolder)
      return { ok, instruction: `E-mail movido para ${args.toFolder}.` }
    }

    case 'get_notification_prefs': {
      return { ok: true, ...accountManager.getNotificationPrefs() }
    }

    case 'set_notification_prefs': {
      const prefs = accountManager.setNotificationPrefs({
        primaryOnly: typeof args.primaryOnly === 'boolean' ? args.primaryOnly : undefined,
        unreadWindowHours: typeof args.unreadWindowHours === 'number' ? args.unreadWindowHours : undefined
      })
      return { ok: true, ...prefs }
    }

    case 'sync': {
      await accountManager.checkAllAccountsForNewEmails()
      return { ok: true }
    }

    default:
      return { ok: false, error: `Ferramenta desconhecida: ${toolName}` }
  }
}

// Listen to messages from MomAI extension host
process.on('message', async (msg: any) => {
  if (!msg || typeof msg !== 'object') return
  if (msg.type === 'execute') {
    const { requestId, payload } = msg
    const { toolName, args } = payload || {}
    try {
      const result = await executeTool(toolName, args)
      safeSend({ type: 'response', requestId, result })
    } catch (err: any) {
      safeSend({
        type: 'response',
        requestId,
        result: { ok: false, error: err?.message || String(err) }
      })
    }
  } else if (msg.type === 'shutdown') {
    process.exit(0)
  }
})

process.on('disconnect', () => {
  process.exit(0)
})

module.exports = {
  execute: executeTool,
  executeTool
}
