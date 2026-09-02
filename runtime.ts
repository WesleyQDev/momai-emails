// runtime.ts
// MomAI E-mails persistent background worker
// Handles IPC execution, tool execution for Assistant, automations, and event dispatch

const path = require('node:path')
const fs = require('node:fs')

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
  moveMessage
} = require('./email-client.ts')

const accountManager = new AccountManager()

// Setup event emission on new emails
accountManager.setOnNewEmail(({ accountId, email }: any) => {
  try {
    const fromStr = email.from ? (email.from.name ? `${email.from.name} <${email.from.address}>` : email.from.address) : 'Desconhecido'
    const toStr = Array.isArray(email.to) ? email.to.map((t: any) => t.address || t.name).join(', ') : ''

    // 1. Emit general new_email event
    safeSend({
      type: 'event',
      eventType: 'new_email',
      data: {
        accountId,
        from: fromStr,
        to: toStr,
        subject: email.subject || '(Sem assunto)',
        snippet: email.snippet || '',
        date: email.date,
        messageId: email.messageId || email.id
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

    // 3. Emit badge_update so sidebar lights up even when extension UI is not open
    safeSend({
      type: 'event',
      eventType: 'badge_update',
      data: {
        extensionId: 'momai-emails',
        count: true
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

// Initialize manager on startup
accountManager.initialize()
  .then(() => {
    safeSend({ type: 'ready' })
  })
  .catch((err: any) => {
    console.error('[runtime:momai-emails] Init failed:', err)
    safeSend({ type: 'ready' })
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
        const folders = await listMailboxes(account)
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
        const limit = typeof args.limit === 'number' ? args.limit : 25
        const unreadOnly = Boolean(args.unreadOnly)
        const messages = await fetchMessages(account, folder, limit, unreadOnly)
        return {
          ok: true,
          folder,
          messages,
          total: messages.length,
          instruction: `Encontrados ${messages.length} e-mails na pasta ${folder}.`,
          directResponse: messages.length === 0
            ? `Nenhum e-mail recente na pasta ${folder}.`
            : `Aqui estão os ${messages.length} e-mails mais recentes de ${account.email}:\n` +
              messages.slice(0, 5).map((m: any) => `- De: ${m.from?.name || m.from?.address} | Assunto: "${m.subject}"`).join('\n')
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

        // Mark as read automatically when opened
        setMessageReadStatus(account, email.uid, true, folder).catch(() => {})

        return {
          ok: true,
          email,
          instruction: `E-mail de ${email.from.name || email.from.address}: "${email.subject}".`,
          directResponse: `Assunto: ${email.subject}\nDe: ${email.from.name || email.from.address}\nData: ${email.date}\n\n${email.text || email.snippet || '(Sem conteúdo de texto)'}`
        }
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
        const limit = typeof args.limit === 'number' ? args.limit : 15
        const messages = await searchMessages(account, query, folder, limit)
        return {
          ok: true,
          query,
          messages,
          total: messages.length,
          instruction: `Busca por "${query}" retornou ${messages.length} e-mail(s).`,
          directResponse: messages.length === 0
            ? `Nenhum e-mail encontrado para o termo "${query}".`
            : `Encontrados ${messages.length} e-mails para "${query}":\n` +
              messages.map((m: any) => `- De: ${m.from?.name || m.from?.address} | Assunto: "${m.subject}"`).join('\n')
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
          references: args.references
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

        const formattedBody = args.body + `\n\n--- Mensagem Original ---\nDe: ${origEmail.from.name || origEmail.from.address}\nData: ${origEmail.date}\n\n${origEmail.text || origEmail.snippet}`

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
        const formattedBody = `${comment}---------- Mensagem Encaminhada ----------\nDe: ${origEmail.from.name || origEmail.from.address}\nData: ${origEmail.date}\nAssunto: ${origEmail.subject}\nPara: ${origEmail.to.map((t: any) => t.address).join(', ')}\n\n${origEmail.text || origEmail.snippet}`

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
      return { ok, instruction: 'E-mail marcado como lido.' }
    }

    case 'mark_as_unread': {
      const account = accountManager.getAccount(args.accountId)
      if (!account) return { ok: false, error: 'Conta não encontrada.' }
      const uid = parseInt(args.messageId || args.uid, 10)
      const ok = await setMessageReadStatus(account, uid, false, args.folder || 'INBOX')
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
