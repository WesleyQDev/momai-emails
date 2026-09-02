// src/page.tsx
// Main application page for MomAI E-mails extension

import React, { useState, useEffect, useCallback, useTransition, useRef } from 'react'
import sdk from 'momai:sdk'
import { useExtensionEvents } from 'momai:events'
import { emailApi } from './services/api'
import { emailStorageCache } from './services/cache'
import type { PublicEmailAccount, EmailFolder, EmailMessage, SendEmailPayload } from './services/types'
import { EmailsHeader } from './components/EmailsHeader'
import { ConnectAccountView } from './components/ConnectAccountView'
import { Sidebar } from './components/Sidebar'
import { EmailList } from './components/EmailList'
import { EmailReader } from './components/EmailReader'
import { EmailComposer } from './components/EmailComposer'

export const EmailsPage: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
  const [, startTransition] = useTransition()

  // In-memory SWR caches & request tracking
  const folderCacheRef = useRef<Map<string, EmailMessage[]>>(new Map())
  const emailBodyCacheRef = useRef<Map<string, EmailMessage>>(new Map())
  const notifiedEmailsRef = useRef<Set<string>>(new Set())
  const currentReqSeqRef = useRef(0)

  // Accounts state (initialized immediately from persistent cache if available)
  const [accounts, setAccounts] = useState<PublicEmailAccount[]>(() => {
    return emailStorageCache.getAccounts() || []
  })
  const [activeAccountId, setActiveAccountId] = useState<string | null>(() => {
    const cachedAccs = emailStorageCache.getAccounts() || []
    const active = cachedAccs.find((a) => a.active) || cachedAccs[0]
    return active ? active.id : null
  })
  const [isAddingAccount, setIsAddingAccount] = useState(false)

  // Folders state (initialized immediately from persistent cache so they never disappear on reload)
  const [folders, setFolders] = useState<EmailFolder[]>(() => {
    const cachedAccs = emailStorageCache.getAccounts() || []
    const active = cachedAccs.find((a) => a.active) || cachedAccs[0]
    if (active) {
      return emailStorageCache.getFolders(active.id) || []
    }
    return []
  })
  const [activeFolder, setActiveFolder] = useState('INBOX')

  // Messages state (initialized from persistent cache for active account INBOX)
  const [messages, setMessages] = useState<EmailMessage[]>(() => {
    const cachedAccs = emailStorageCache.getAccounts() || []
    const active = cachedAccs.find((a) => a.active) || cachedAccs[0]
    if (active) {
      return emailStorageCache.getFolderEmails(active.id, 'INBOX') || []
    }
    return []
  })
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Selected email / Reader state
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null)
  const [loadingEmailContent, setLoadingEmailContent] = useState(false)

  // Composer state
  const [isComposeOpen, setIsComposeOpen] = useState(false)
  const [composeInitialData, setComposeInitialData] = useState<Partial<SendEmailPayload> | undefined>(undefined)

  // 1. Load accounts on startup (and keep persistent cache up to date)
  const loadAccounts = useCallback(async () => {
    try {
      const res = await emailApi.listAccounts()
      if (res && Array.isArray(res.accounts)) {
        emailStorageCache.setAccounts(res.accounts)
        startTransition(() => {
          setAccounts(res.accounts)
          setActiveAccountId((prev) => {
            if (prev && res.accounts.some((a) => a.id === prev)) return prev
            const active = res.accounts.find((a) => a.active) || res.accounts[0]
            return active ? active.id : null
          })
        })
      }
    } catch (err) {
      console.error('[momai-emails] Error loading accounts:', err)
    }
  }, [])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  // 2. Load folders when active account changes (immediate 0ms cached display + background sync)
  const loadFolders = useCallback(async (accId?: string) => {
    if (!accId) return
    const cached = emailStorageCache.getFolders(accId)
    if (cached && cached.length > 0) {
      setFolders(cached)
    }

    try {
      const res = await emailApi.listFolders(accId)
      if (res && res.ok && Array.isArray(res.folders)) {
        emailStorageCache.setFolders(accId, res.folders)
        setFolders(res.folders)
      }
    } catch (err) {
      console.error('[momai-emails] Error loading folders:', err)
    }
  }, [])

  useEffect(() => {
    if (activeAccountId) {
      const cached = emailStorageCache.getFolders(activeAccountId)
      if (cached && cached.length > 0) {
        setFolders(cached)
      }
      loadFolders(activeAccountId)
    } else {
      setFolders([])
      setMessages([])
      setSelectedEmail(null)
    }
  }, [activeAccountId, loadFolders])

  // Clear sidebar unread badge ONLY when user is actively viewing this extension page
  useEffect(() => {
    if (isActive) {
      sdk.badge.clear('momai-emails')
    }
  }, [isActive])

  // 3. Load emails with SWR (0ms instant display from memory + localStorage cache, background refresh with cancellation)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false)
  const [isSearchMode, setIsSearchMode] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const PAGE_SIZE = 50

  const loadEmails = useCallback(async (folder = 'INBOX', accId = activeAccountId, silent = false) => {
    if (!accId) return
    const reqSeq = ++currentReqSeqRef.current
    const cacheKey = `${accId}:${folder}`

    // 1st: check in-memory Map; 2nd: check persistent localStorage cache
    const cached = folderCacheRef.current.get(cacheKey) || emailStorageCache.getFolderEmails(accId, folder)

    // SWR: If cached, display immediately in 0ms!
    if (cached && cached.length > 0) {
      folderCacheRef.current.set(cacheKey, cached)
      setMessages(cached)
      setLoadingMessages(false)
    } else if (!silent) {
      setLoadingMessages(true)
    }
    setMessagesError(null)
    setIsSearchMode(false)

    try {
      const res = await emailApi.listEmails(folder, accId, PAGE_SIZE, false, 0)
      // Discard if user already switched to another folder
      if (reqSeq !== currentReqSeqRef.current) return

      if (res && res.ok && Array.isArray(res.messages)) {
        folderCacheRef.current.set(cacheKey, res.messages)
        emailStorageCache.setFolderEmails(accId, folder, res.messages)
        setMessages(res.messages)
        setHasMoreMessages(Boolean(res.hasMore))

        // Background pre-fetch top email body so opening is instantaneous
        const topMsg = res.messages[0]
        if (topMsg) {
          const bodyKey = `${accId}:${topMsg.id}`
          if (!emailBodyCacheRef.current.has(bodyKey) && !emailStorageCache.getEmailBody(accId, topMsg.id)) {
            emailApi.readEmail(topMsg.id, folder, accId).then((r) => {
              if (r?.ok && r.email) {
                emailBodyCacheRef.current.set(bodyKey, r.email)
                emailStorageCache.setEmailBody(accId, topMsg.id, r.email)
              }
            }).catch(() => {})
          }
        }
      } else if (!cached) {
        setMessagesError('Não foi possível carregar as mensagens.')
      }
    } catch (err: any) {
      if (reqSeq !== currentReqSeqRef.current) return
      if (!cached) {
        setMessagesError(err?.message || 'Erro de conexão ao carregar e-mails.')
      }
    } finally {
      if (reqSeq === currentReqSeqRef.current) {
        setLoadingMessages(false)
      }
    }
  }, [activeAccountId])

  // Load more messages (next page) — appends to current list
  const loadMoreEmails = useCallback(async () => {
    if (!activeAccountId || loadingMoreMessages || !hasMoreMessages || isSearchMode) return
    setLoadingMoreMessages(true)
    try {
      const offset = messages.length
      const res = await emailApi.listEmails(activeFolder, activeAccountId, PAGE_SIZE, false, offset)
      if (res && res.ok && Array.isArray(res.messages) && res.messages.length > 0) {
        // Deduplicate by id before appending
        const existingIds = new Set(messages.map((m) => m.id))
        const newMsgs = res.messages.filter((m) => !existingIds.has(m.id))
        if (newMsgs.length > 0) {
          const merged = [...messages, ...newMsgs]
          setMessages(merged)
          // Update cache with merged list
          const cacheKey = `${activeAccountId}:${activeFolder}`
          folderCacheRef.current.set(cacheKey, merged)
          emailStorageCache.setFolderEmails(activeAccountId, activeFolder, merged)
        }
        setHasMoreMessages(Boolean(res.hasMore))
      } else {
        setHasMoreMessages(false)
      }
    } catch {
      // Silently fail on load more — user can scroll again to retry
    } finally {
      setLoadingMoreMessages(false)
    }
  }, [activeAccountId, activeFolder, messages, loadingMoreMessages, hasMoreMessages, isSearchMode])

  // Server-side IMAP search (debounced)
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)

    if (!query.trim()) {
      // Exit search mode — restore normal folder emails
      setIsSearchMode(false)
      const cacheKey = `${activeAccountId}:${activeFolder}`
      const cached = folderCacheRef.current.get(cacheKey) || emailStorageCache.getFolderEmails(activeAccountId || '', activeFolder)
      if (cached) setMessages(cached)
      setHasMoreMessages(true)
      return
    }

    // Debounce 500ms before hitting IMAP server
    searchTimerRef.current = setTimeout(async () => {
      if (!activeAccountId) return
      setIsSearchMode(true)
      setLoadingMessages(true)
      setHasMoreMessages(false)
      try {
        const res = await emailApi.searchEmails(query.trim(), activeFolder, activeAccountId)
        if (res && res.ok && Array.isArray(res.messages)) {
          setMessages(res.messages)
        } else {
          setMessages([])
        }
      } catch {
        setMessages([])
      } finally {
        setLoadingMessages(false)
      }
    }, 500)
  }, [activeAccountId, activeFolder])

  useEffect(() => {
    if (activeAccountId) {
      setSearchQuery('')
      setIsSearchMode(false)
      loadEmails(activeFolder, activeAccountId)
    }
  }, [activeAccountId, activeFolder, loadEmails])

  // 4. Real-time updates: listen to new incoming emails and dispatch native OS notification
  useExtensionEvents({
    onEvent: (event: any) => {
      if (!event || event.eventType !== 'new_email') return
      const { accountId, subject, from, messageId } = event.data || {}

      // Extrai apenas o nome do remetente limpo para a notificação
      let senderName = 'Novo e-mail'
      if (typeof from === 'object' && from !== null) {
        senderName = from.name || from.address || 'Novo e-mail'
      } else if (typeof from === 'string' && from) {
        const match = from.match(/^([^<]+)<.*>$/)
        senderName = match ? match[1].trim().replace(/^["']|["']$/g, '') : from
      }

      // Deduplicação rigorosa para evitar notificações ou logs repetidos
      const dedupeKey =
        messageId ||
        event.data?.uid ||
        `${accountId || ''}:${senderName}:${subject || ''}:${event.data?.date || ''}`
      if (dedupeKey) {
        if (notifiedEmailsRef.current.has(dedupeKey)) {
          return
        }
        notifiedEmailsRef.current.add(dedupeKey)
        if (notifiedEmailsRef.current.size > 200) {
          const first = notifiedEmailsRef.current.values().next().value
          if (first) notifiedEmailsRef.current.delete(first)
        }
      }

      console.log(`[momai-emails] Novo e-mail recebido: ${subject} de ${from}`)

      // If the incoming email belongs to the active account, refresh inbox silently
      if (accountId === activeAccountId) {
        if (activeFolder.toUpperCase() === 'INBOX') {
          loadEmails(activeFolder, activeAccountId, true)
        }
        loadFolders(activeAccountId || undefined)
      }

      // Increment sidebar badge ONLY if the user is not actively viewing the emails page
      if (!isActive) {
        sdk.badge.set((prev: number) => prev + 1, 'momai-emails')
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
    const cached = emailBodyCacheRef.current.get(cacheKey) || (accId ? emailStorageCache.getEmailBody(accId, msg.id) : null)

    // SWR: If full email body is in cache, open immediately in 0ms!
    if (cached) {
      emailBodyCacheRef.current.set(cacheKey, cached)
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
        if (accId) {
          emailStorageCache.setEmailBody(accId, msg.id, res.email)
        }
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
    setMessages((prev) => {
      const updated = prev.map((m) => (m.id === id ? { ...m, starred: newStarred } : m))
      if (activeAccountId) {
        emailStorageCache.setFolderEmails(activeAccountId, activeFolder, updated)
      }
      return updated
    })
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
    setMessages((prev) => {
      const updated = prev.map((m) => (m.id === id ? { ...m, read: true } : m))
      if (activeAccountId) {
        emailStorageCache.setFolderEmails(activeAccountId, activeFolder, updated)
      }
      return updated
    })
    if (selectedEmail?.id === id) {
      setSelectedEmail({ ...selectedEmail, read: true })
    }
    sdk.badge.clear('momai-emails')
    // Update folder cache
    const cacheKey = `${activeAccountId}:${activeFolder}`
    const cached = folderCacheRef.current.get(cacheKey)
    if (cached) {
      folderCacheRef.current.set(cacheKey, cached.map((m) => (m.id === id ? { ...m, read: true } : m)))
    }
    emailApi.markAsRead(id, activeFolder, activeAccountId || undefined).catch(() => {})
  }

  const handleMarkUnread = async (id: string) => {
    setMessages((prev) => {
      const updated = prev.map((m) => (m.id === id ? { ...m, read: false } : m))
      if (activeAccountId) {
        emailStorageCache.setFolderEmails(activeAccountId, activeFolder, updated)
      }
      return updated
    })
    if (selectedEmail?.id === id) {
      setSelectedEmail({ ...selectedEmail, read: false })
      setSelectedEmail(null) // Return to list if marked unread from reader
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
    setMessages((prev) => {
      const updated = prev.filter((m) => m.id !== id)
      if (activeAccountId) {
        emailStorageCache.setFolderEmails(activeAccountId, activeFolder, updated)
      }
      return updated
    })
    if (selectedEmail?.id === id) {
      setSelectedEmail(null)
    }
    sdk.badge.clear('momai-emails')
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
      {/* 1. Header with Provider Logo (left) and Account Profile Switcher (right) */}
      <EmailsHeader
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
            onSearchChange={handleSearchChange}
            onRefresh={() => loadEmails(activeFolder, activeAccountId || undefined)}
            onSelectEmail={handleSelectEmail}
            onToggleStarred={handleToggleStarred}
            onMarkRead={handleMarkRead}
            onMarkUnread={handleMarkUnread}
            onDelete={handleDelete}
            onBatchDelete={handleBatchDelete}
            onBatchMarkRead={handleBatchMarkRead}
            hasMore={hasMoreMessages}
            loadingMore={loadingMoreMessages}
            onLoadMore={loadMoreEmails}
            totalCount={folders.find((f) => f.path.toLowerCase() === activeFolder.toLowerCase())?.totalCount || messages.length}
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
