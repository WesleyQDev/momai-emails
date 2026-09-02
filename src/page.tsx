// src/page.tsx
// Main application page for MomAI E-mails extension

import React, { useState, useEffect, useCallback, useTransition, useRef } from 'react'
import sdk from 'momai:sdk'
import { useExtensionEvents } from 'momai:events'
import { emailApi } from './services/api'
import type { PublicEmailAccount, EmailFolder, EmailMessage, SendEmailPayload } from './services/types'
import { AccountTabs } from './components/AccountTabs'
import { ConnectAccountView } from './components/ConnectAccountView'
import { Sidebar } from './components/Sidebar'
import { EmailList } from './components/EmailList'
import { EmailReader } from './components/EmailReader'
import { EmailComposer } from './components/EmailComposer'

export const EmailsPage: React.FC = () => {
  const [, startTransition] = useTransition()

  // In-memory SWR caches for 0ms transitions
  const folderCacheRef = useRef<Map<string, EmailMessage[]>>(new Map())
  const emailBodyCacheRef = useRef<Map<string, EmailMessage>>(new Map())

  // Accounts state
  const [accounts, setAccounts] = useState<PublicEmailAccount[]>([])
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [isAddingAccount, setIsAddingAccount] = useState(false)

  // Folders state
  const [folders, setFolders] = useState<EmailFolder[]>([])
  const [activeFolder, setActiveFolder] = useState('INBOX')

  // Messages state
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Selected email / Reader state
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null)
  const [loadingEmailContent, setLoadingEmailContent] = useState(false)

  // Composer state
  const [isComposeOpen, setIsComposeOpen] = useState(false)
  const [composeInitialData, setComposeInitialData] = useState<Partial<SendEmailPayload> | undefined>(undefined)

  // 1. Load accounts on startup
  const loadAccounts = useCallback(async () => {
    try {
      const res = await emailApi.listAccounts()
      if (res && Array.isArray(res.accounts)) {
        startTransition(() => {
          setAccounts(res.accounts)
          const active = res.accounts.find((a) => a.active) || res.accounts[0]
          if (active) {
            setActiveAccountId(active.id)
          }
        })
      }
    } catch (err) {
      console.error('[momai-emails] Error loading accounts:', err)
    }
  }, [])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  // 2. Load folders when active account changes
  const loadFolders = useCallback(async (accId?: string) => {
    if (!accId) return
    try {
      const res = await emailApi.listFolders(accId)
      if (res && res.ok && Array.isArray(res.folders)) {
        setFolders(res.folders)
        // Calculate unread count in inbox to update sidebar badge
        const inbox = res.folders.find(
          (f: any) => f.role === 'inbox' || f.path.toUpperCase() === 'INBOX'
        )
        const unread = inbox
          ? inbox.unreadCount
          : res.folders.reduce((acc: number, f: any) => acc + (f.unreadCount || 0), 0)
        if (unread > 0) {
          sdk.badge.set(unread)
        } else {
          sdk.badge.clear()
        }
      }
    } catch (err) {
      console.error('[momai-emails] Error loading folders:', err)
    }
  }, [])

  useEffect(() => {
    if (activeAccountId) {
      loadFolders(activeAccountId)
    } else {
      setFolders([])
      setMessages([])
      setSelectedEmail(null)
      sdk.badge.clear()
    }
  }, [activeAccountId, loadFolders])

  // 3. Load emails with SWR (0ms instant display from cache, background refresh)
  const loadEmails = useCallback(async (folder = 'INBOX', accId = activeAccountId, silent = false) => {
    if (!accId) return
    const cacheKey = `${accId}:${folder}`
    const cached = folderCacheRef.current.get(cacheKey)

    // SWR: If cached, display immediately in 0ms!
    if (cached && cached.length > 0) {
      setMessages(cached)
      setLoadingMessages(false)
      if (folder.toUpperCase() === 'INBOX') {
        const unread = cached.filter((m) => !m.read).length
        if (unread > 0) sdk.badge.set(unread)
        else sdk.badge.clear()
      }
    } else if (!silent) {
      setLoadingMessages(true)
    }
    setMessagesError(null)

    try {
      const res = await emailApi.listEmails(folder, accId)
      if (res && res.ok && Array.isArray(res.messages)) {
        folderCacheRef.current.set(cacheKey, res.messages)
        setMessages(res.messages)

        if (folder.toUpperCase() === 'INBOX') {
          const unread = res.messages.filter((m) => !m.read).length
          if (unread > 0) sdk.badge.set(unread)
          else sdk.badge.clear()
        }

        // Background pre-fetch top 2 emails so opening them is instantaneous (0ms)
        const toPrefetch = res.messages.slice(0, 2)
        for (const item of toPrefetch) {
          const bodyKey = `${accId}:${item.id}`
          if (!emailBodyCacheRef.current.has(bodyKey)) {
            emailApi.readEmail(item.id, folder, accId).then((r) => {
              if (r?.ok && r.email) {
                emailBodyCacheRef.current.set(bodyKey, r.email)
              }
            }).catch(() => {})
          }
        }
      } else if (!cached) {
        setMessagesError('Não foi possível carregar as mensagens.')
      }
    } catch (err: any) {
      if (!cached) {
        setMessagesError(err?.message || 'Erro de conexão ao carregar e-mails.')
      }
    } finally {
      setLoadingMessages(false)
    }
  }, [activeAccountId])

  useEffect(() => {
    if (activeAccountId) {
      loadEmails(activeFolder, activeAccountId)
    }
  }, [activeAccountId, activeFolder, loadEmails])

  // 4. Real-time updates: listen to new incoming emails and dispatch native OS notification
  useExtensionEvents({
    onEvent: (event: any) => {
      if (!event || event.eventType !== 'new_email') return
      const { accountId, subject, from } = event.data || {}
      console.log(`[momai-emails] Novo e-mail recebido: ${subject} de ${from}`)

      // Check notification preferences (default unchecked unless user opted in)
      const isNotifGloballyEnabled = localStorage.getItem('momai_emails_notifications_enabled') === 'true'
      const isNotifAccountEnabled = accountId
        ? localStorage.getItem(`momai_emails_notify_${accountId}`) === 'true'
        : false
      const fromStr =
        typeof from === 'object'
          ? from?.name || from?.address || 'Novo remetente'
          : from || 'Novo remetente'

      if (isNotifGloballyEnabled || isNotifAccountEnabled) {
        sdk.notifications.send({
          title: `Novo e-mail de ${fromStr}`,
          body: subject || '(Sem assunto)',
          action: 'momai-emails:open'
        }).catch(() => {})
      }

      // If the incoming email belongs to the active account, refresh inbox silently
      if (accountId === activeAccountId) {
        if (activeFolder.toUpperCase() === 'INBOX') {
          loadEmails(activeFolder, activeAccountId, true)
        }
        loadFolders(activeAccountId || undefined)
      } else {
        // Increment badge if incoming for another account or background
        sdk.badge.set((prev: any) => (typeof prev === 'number' ? prev + 1 : 1))
      }
    }
  })

  // 5. Account operations
  const handleSelectAccount = async (id: string) => {
    setActiveAccountId(id)
    setSelectedEmail(null)
    await emailApi.setActiveAccount(id)
  }

  const handleSaveAccount = async (data: any) => {
    const res = await emailApi.addAccount(data)
    if (res.ok) {
      await loadAccounts()
      if (res.account?.id) {
        setActiveAccountId(res.account.id)
      }
    }
    return res
  }

  const handleRemoveAccount = async (id: string) => {
    const res = await emailApi.removeAccount(id)
    if (res.ok) {
      await loadAccounts()
    }
  }

  // 6. Message actions (Instant 0ms opening via body cache + optimistic UI updates)
  const handleSelectEmail = async (msg: EmailMessage) => {
    const accId = activeAccountId || undefined
    const cacheKey = `${accId}:${msg.id}`
    const cached = emailBodyCacheRef.current.get(cacheKey)

    // SWR: If full email body is in cache, open immediately in 0ms!
    if (cached) {
      setSelectedEmail(cached)
      setLoadingEmailContent(false)
      if (!msg.read) {
        handleMarkRead(msg.id)
      }
      return
    }

    setSelectedEmail(msg)
    setLoadingEmailContent(true)
    try {
      const res = await emailApi.readEmail(msg.id, activeFolder, accId)
      if (res.ok && res.email) {
        emailBodyCacheRef.current.set(cacheKey, res.email)
        setSelectedEmail(res.email)
        // Mark as read in local list state
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, read: true } : m))
        )
      }
    } catch (err) {
      console.error('[momai-emails] Error loading full email:', err)
    } finally {
      setLoadingEmailContent(false)
    }
  }

  const handleToggleStarred = async (id: string, currentStarred: boolean) => {
    const newStarred = !currentStarred
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, starred: newStarred } : m))
    )
    if (selectedEmail?.id === id) {
      setSelectedEmail({ ...selectedEmail, starred: newStarred })
    }
    // Update folder cache
    const cacheKey = `${activeAccountId}:${activeFolder}`
    const cached = folderCacheRef.current.get(cacheKey)
    if (cached) {
      folderCacheRef.current.set(cacheKey, cached.map((m) => (m.id === id ? { ...m, starred: newStarred } : m)))
    }
    emailApi.toggleStarred(id, newStarred, activeFolder, activeAccountId || undefined).catch(() => {})
  }

  const handleMarkRead = async (id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, read: true } : m))
    )
    if (selectedEmail?.id === id) {
      setSelectedEmail({ ...selectedEmail, read: true })
    }
    if (activeFolder.toUpperCase() === 'INBOX') {
      const remaining = messages.filter((m) => m.id !== id && !m.read).length
      if (remaining > 0) sdk.badge.set(remaining)
      else sdk.badge.clear()
    }
    // Update folder cache
    const cacheKey = `${activeAccountId}:${activeFolder}`
    const cached = folderCacheRef.current.get(cacheKey)
    if (cached) {
      folderCacheRef.current.set(cacheKey, cached.map((m) => (m.id === id ? { ...m, read: true } : m)))
    }
    emailApi.markAsRead(id, activeFolder, activeAccountId || undefined).catch(() => {})
  }

  const handleMarkUnread = async (id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, read: false } : m))
    )
    if (selectedEmail?.id === id) {
      setSelectedEmail({ ...selectedEmail, read: false })
      setSelectedEmail(null) // Return to list if marked unread from reader
    }
    if (activeFolder.toUpperCase() === 'INBOX') {
      const remaining = messages.filter((m) => m.id === id || !m.read).length
      sdk.badge.set(remaining)
    }
    // Update folder cache
    const cacheKey = `${activeAccountId}:${activeFolder}`
    const cached = folderCacheRef.current.get(cacheKey)
    if (cached) {
      folderCacheRef.current.set(cacheKey, cached.map((m) => (m.id === id ? { ...m, read: false } : m)))
    }
    emailApi.markAsUnread(id, activeFolder, activeAccountId || undefined).catch(() => {})
  }

  const handleDelete = async (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
    if (selectedEmail?.id === id) {
      setSelectedEmail(null)
    }
    if (activeFolder.toUpperCase() === 'INBOX') {
      const remaining = messages.filter((m) => m.id !== id && !m.read).length
      if (remaining > 0) sdk.badge.set(remaining)
      else sdk.badge.clear()
    }
    // Update folder cache
    const cacheKey = `${activeAccountId}:${activeFolder}`
    const cached = folderCacheRef.current.get(cacheKey)
    if (cached) {
      folderCacheRef.current.set(cacheKey, cached.filter((m) => m.id !== id))
    }
    emailApi.deleteEmail(id, activeFolder, activeAccountId || undefined).catch(() => {})
  }

  const handleBatchDelete = async (ids: string[]) => {
    const idSet = new Set(ids)
    setMessages((prev) => prev.filter((m) => !idSet.has(m.id)))
    if (selectedEmail && idSet.has(selectedEmail.id)) {
      setSelectedEmail(null)
    }
    for (const id of ids) {
      await emailApi.deleteEmail(id, activeFolder, activeAccountId || undefined)
    }
  }

  const handleBatchMarkRead = async (ids: string[]) => {
    const idSet = new Set(ids)
    setMessages((prev) =>
      prev.map((m) => (idSet.has(m.id) ? { ...m, read: true } : m))
    )
    for (const id of ids) {
      await emailApi.markAsRead(id, activeFolder, activeAccountId || undefined)
    }
  }

  // 7. Compose & Reply actions
  const handleOpenCompose = () => {
    setComposeInitialData(undefined)
    setIsComposeOpen(true)
  }

  const handleReply = (email: EmailMessage, replyAll = false) => {
    const replySubject = email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`
    const replyTo = email.replyTo?.[0]?.address || email.from.address
    let replyCc = ''
    if (replyAll && email.cc && email.cc.length > 0) {
      replyCc = email.cc.map((c) => c.address).join(', ')
    }

    setComposeInitialData({
      accountId: activeAccountId || undefined,
      to: replyTo,
      cc: replyCc,
      subject: replySubject,
      inReplyTo: email.messageId,
      references: email.messageId,
      body: `\n\nEm ${email.date}, ${email.from.name || email.from.address} escreveu:\n> ${email.text || email.snippet}`
    })
    setIsComposeOpen(true)
  }

  const handleForward = (email: EmailMessage) => {
    const forwardSubject = email.subject.startsWith('Fwd:') || email.subject.startsWith('Enc:')
      ? email.subject
      : `Fwd: ${email.subject}`

    setComposeInitialData({
      accountId: activeAccountId || undefined,
      subject: forwardSubject,
      body: `\n\n---------- Mensagem Encaminhada ----------\nDe: ${email.from.name || email.from.address}\nData: ${email.date}\nAssunto: ${email.subject}\nPara: ${email.to.map((t) => t.address).join(', ')}\n\n${email.text || email.snippet}`
    })
    setIsComposeOpen(true)
  }

  const handleSendEmail = async (payload: SendEmailPayload) => {
    const res = await emailApi.sendEmail(payload)
    if (res.ok) {
      // Refresh current folder if in sent folder
      if (activeFolder.toLowerCase().includes('sent') || activeFolder.toLowerCase().includes('enviad')) {
        loadEmails(activeFolder, activeAccountId || undefined)
      }
    }
    return res
  }

  const handleQuickSendReply = async (body: string): Promise<boolean> => {
    if (!selectedEmail) return false
    const replySubject = selectedEmail.subject.startsWith('Re:')
      ? selectedEmail.subject
      : `Re: ${selectedEmail.subject}`

    const res = await emailApi.sendEmail({
      accountId: activeAccountId || undefined,
      to: selectedEmail.replyTo?.[0]?.address || selectedEmail.from.address,
      subject: replySubject,
      body,
      inReplyTo: selectedEmail.messageId,
      references: selectedEmail.messageId
    })
    return Boolean(res.ok)
  }

  // If user has no accounts, or clicked "+ Adicionar Conta", show full-screen onboarding view
  if (accounts.length === 0 || isAddingAccount) {
    return (
      <ConnectAccountView
        onSave={async (data) => {
          const res = await handleSaveAccount(data)
          if (res.ok) {
            setIsAddingAccount(false)
          }
          return res
        }}
        onCancel={() => setIsAddingAccount(false)}
        canCancel={accounts.length > 0}
      />
    )
  }

  return (
    <div className="w-full h-full flex flex-col bg-bg text-text overflow-hidden font-sans">
      {/* 1. Account Tabs Bar */}
      <AccountTabs
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSelectAccount={handleSelectAccount}
        onOpenAddModal={() => setIsAddingAccount(true)}
        onRemoveAccount={handleRemoveAccount}
      />

      {/* 2. Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          folders={folders}
          activeFolder={activeFolder}
          onSelectFolder={(folderPath) => {
            setActiveFolder(folderPath)
            setSelectedEmail(null)
          }}
          onOpenCompose={handleOpenCompose}
        />

        {/* Content View: EmailList or EmailReader */}
        {selectedEmail ? (
          <EmailReader
            email={selectedEmail}
            loading={loadingEmailContent}
            onBack={() => setSelectedEmail(null)}
            onReply={handleReply}
            onForward={handleForward}
            onDelete={handleDelete}
            onMarkUnread={handleMarkUnread}
            onQuickSendReply={handleQuickSendReply}
          />
        ) : (
          <EmailList
            messages={messages}
            loading={loadingMessages}
            error={messagesError}
            activeFolder={activeFolder}
            selectedEmailId={selectedEmail ? (selectedEmail as EmailMessage).id : null}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onRefresh={() => loadEmails(activeFolder, activeAccountId || undefined)}
            onSelectEmail={handleSelectEmail}
            onToggleStarred={handleToggleStarred}
            onMarkRead={handleMarkRead}
            onMarkUnread={handleMarkUnread}
            onDelete={handleDelete}
            onBatchDelete={handleBatchDelete}
            onBatchMarkRead={handleBatchMarkRead}
          />
        )}
      </div>

      {/* 3. Compose Floating Modal */}
      <EmailComposer
        isOpen={isComposeOpen}
        accounts={accounts}
        activeAccountId={activeAccountId}
        initialData={composeInitialData}
        onClose={() => setIsComposeOpen(false)}
        onSend={handleSendEmail}
      />
    </div>
  )
}

// Register renderer with MomAI platform
sdk.registry.registerRenderer('momai-emails-page', EmailsPage)

export default EmailsPage
