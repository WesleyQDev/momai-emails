// src/page.tsx
// Main application page for MomAI E-mails extension

import React, { useState, useEffect, useCallback, useTransition, useRef } from 'react'
import sdk from 'momai:sdk'
import { useExtensionEvents } from 'momai:events'
import { emailApi } from './services/api'
import { emailStorageCache } from './services/cache'
import { loadEmailSettings, saveEmailSettings, unreadWindowMs, type EmailSettings as EmailSettingsState } from './services/settings'
import { adjustFolderUnread, getFolderDisplayUnread, syncInboxPrimaryUnread } from './services/unread-today'
import { classifyEmailCategory, shouldNotifyForCategory } from './services/email-categories'
import { EMAIL_PAGE_SIZE } from './services/paging'
import {
  dedupeFoldersByRole,
  getStarredMessages,
  isArchiveFolder,
  isDraftsFolder,
  isTrashFolder,
  isVirtualStarredFolder,
  resolveDraftsPath,
  resolveInboxPath,
  isInboxFolder,
  mergeWithDefaultFolders,
  getDefaultFolders,
  DEFAULT_STATIC_FOLDERS
} from './services/folders'
import { buildPendingDraft, removePendingDrafts, rememberDraftMessage, forgetDraftMessage } from './services/draft'
import {
  archiveMessageKey,
  setArchiveOrigin,
  getArchiveOrigin,
  clearArchiveOrigin
} from './services/archive-origins'
import { FolderPrewarmer, mergeFolderMessages } from './services/prewarm'
import type { PublicEmailAccount, EmailFolder, EmailMessage, EmailAttachment, SendEmailPayload } from './services/types'
import { useExtensionLocale } from './services/i18n'
import { EmailsHeader } from './components/EmailsHeader'
import { ConnectAccountView } from './components/ConnectAccountView'
import { Sidebar } from './components/Sidebar'
import { EmailList } from './components/EmailList'
import { EmailReader } from './components/EmailReader'
import { EmailComposer } from './components/EmailComposer'
import { EmailSettings } from './components/EmailSettings'
import { PROVIDERS, detectProviderFromEmail } from './services/providers'
import { shouldAcceptAccountsResponse } from './services/accounts-sync'

export const EmailsPage: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
  const [, startTransition] = useTransition()
  const { t } = useExtensionLocale()

  // In-memory SWR caches & request tracking
  const folderCacheRef = useRef<Map<string, EmailMessage[]>>(new Map())
  const emailBodyCacheRef = useRef<Map<string, EmailMessage>>(new Map())
  const prefetchInflightRef = useRef<Set<string>>(new Set())
  const notifiedEmailsRef = useRef<Set<string>>(new Set())
  const burstReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentReqSeqRef = useRef(0)
  const prewarmerRef = useRef(new FolderPrewarmer())

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
  const [accountsLoading, setAccountsLoading] = useState(() => {
    return (emailStorageCache.getAccounts() || []).length === 0
  })
  const accountsRef = useRef<PublicEmailAccount[]>([])
  accountsRef.current = accounts
  const emptyRetryRef = useRef(0)
  const loadAccountsRef = useRef<(opts?: { allowEmpty?: boolean }) => Promise<void>>(async () => {})

  // Folders state (initialized immediately from persistent cache or default folders so they never disappear on reload)
  const [folders, setFolders] = useState<EmailFolder[]>(() => {
    const cachedAccs = emailStorageCache.getAccounts() || []
    const active = cachedAccs.find((a) => a.active) || cachedAccs[0]
    if (active) {
      const cached = emailStorageCache.getFolders(active.id)
      if (cached && cached.length > 0) return mergeWithDefaultFolders(cached)
    }
    return getDefaultFolders()
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
  const [draftNotice, setDraftNotice] = useState<'saving' | 'saved' | 'failed' | null>(null)
  const [sendNotice, setSendNotice] = useState<'sending' | 'sent' | 'failed' | null>(null)

  // Gear-menu preferences (Primary-only alerts + Gmail category tabs)
  const [settings, setSettings] = useState<EmailSettingsState>(() => loadEmailSettings())
  const [syncing, setSyncing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const handleSettingsChange = useCallback((patch: Partial<EmailSettingsState>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveEmailSettings(next)
      emailApi
        .setNotificationPrefs({ primaryOnly: next.notifyPrimaryOnly, unreadWindowHours: next.unreadWindowHours })
        .catch(() => {})
      return next
    })
  }, [])

  // Push the worker-owned choices on startup as well,
  // so OS badges keep working while this page is closed.
  useEffect(() => {
    const initial = loadEmailSettings()
    emailApi
      .setNotificationPrefs({ primaryOnly: initial.notifyPrimaryOnly, unreadWindowHours: initial.unreadWindowHours })
      .catch(() => {})

    return () => {
      prewarmerRef.current.stop()
    }
  }, [])

  // 1. Load accounts on startup (and keep persistent cache up to date).
  // An empty worker reply while accounts are known means the worker has not
  // finished loading yet, so it is ignored (with a short retry) instead of
  // flashing the provider onboarding view.
  const loadAccounts = useCallback(async (opts?: { allowEmpty?: boolean }) => {
    let settled = false
    try {
      const res = await emailApi.listAccounts()
      if (res && Array.isArray(res.accounts)) {
        const cached = emailStorageCache.getAccounts()
        const known = cached && cached.length > 0 ? cached : accountsRef.current
        if (!shouldAcceptAccountsResponse(res.accounts, known, opts?.allowEmpty)) {
          if (emptyRetryRef.current < 4) {
            emptyRetryRef.current += 1
            setTimeout(() => {
              loadAccountsRef.current?.()
            }, 2500)
          }
          return
        }
        emptyRetryRef.current = 0
        settled = true
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
      settled = true
    } finally {
      if (settled) setAccountsLoading(false)
    }
  }, [])
  loadAccountsRef.current = loadAccounts

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  const currentFoldersSeqRef = useRef(0)
  const activeAccountIdRef = useRef<string | null>(activeAccountId)
  activeAccountIdRef.current = activeAccountId
  const activeFolderRef = useRef<string>(activeFolder)
  activeFolderRef.current = activeFolder

  // 2. Load folders when active account changes (immediate 0ms cached display + background sync)
  const loadFolders = useCallback(async (accId = activeAccountIdRef.current) => {
    if (!accId) return
    const reqSeq = ++currentFoldersSeqRef.current
    const cached = emailStorageCache.getFolders(accId)
    const windowMs = unreadWindowMs(settings.unreadWindowHours)
    if (cached && cached.length > 0) {
      let deduped = mergeWithDefaultFolders(cached)
      const inboxCached = emailStorageCache.getFolderEmails(accId, resolveInboxPath(deduped))
      if (inboxCached && inboxCached.length > 0) {
        deduped = syncInboxPrimaryUnread(deduped, inboxCached, settings.showCategoryTabs, windowMs)
      }
      setFolders(deduped)
    } else if (accId === activeAccountIdRef.current) {
      setFolders(getDefaultFolders())
    }

    try {
      const res = await emailApi.listFolders(accId)
      if (reqSeq !== currentFoldersSeqRef.current || accId !== activeAccountIdRef.current) return
      if (res && res.ok && Array.isArray(res.folders)) {
        let folders = mergeWithDefaultFolders(res.folders)
        const inboxCached = emailStorageCache.getFolderEmails(accId, resolveInboxPath(folders))
        if (inboxCached && inboxCached.length > 0) {
          folders = syncInboxPrimaryUnread(folders, inboxCached, settings.showCategoryTabs, windowMs)
        }
        emailStorageCache.setFolders(accId, folders)
        setFolders(folders)

        // Start gentle sequential background pre-warming for folders
        prewarmerRef.current.start({
          accountId: accId,
          folders,
          isCached: (folderPath, aId) => {
            const key = `${aId}:${folderPath}`
            return folderCacheRef.current.has(key) || (emailStorageCache.getFolderEmails(aId, folderPath) !== null)
          },
          fetchEmails: async (folderPath, aId) => {
            return emailApi.listEmails(folderPath, aId, PAGE_SIZE, false, 0)
          },
          onFolderLoaded: (folderPath, aId, msgs) => {
            const key = `${aId}:${folderPath}`
            const existing =
              folderCacheRef.current.get(key) ||
              emailStorageCache.getFolderEmails(aId, folderPath) ||
              []
            const merged = mergeFolderMessages(existing, msgs)
            folderCacheRef.current.set(key, merged)
            emailStorageCache.setFolderEmails(aId, folderPath, merged)
            if (isInboxFolder(folderPath)) {
              setFolders((prevFolders) => {
                const updated = syncInboxPrimaryUnread(prevFolders, merged, settings.showCategoryTabs, windowMs)
                emailStorageCache.setFolders(aId, updated)
                return updated
              })
            }
          },
          throttleMs: 350
        })

        // A selected duplicate disappears from the unified list: follow the surviving same-role folder.
        const current = activeFolderRef.current
        const stillListed = folders.some((f) => f.path.toLowerCase() === current.toLowerCase())
        if (!stillListed && !isVirtualStarredFolder(current, res.folders)) {
          const rawRole =
            DEFAULT_STATIC_FOLDERS.find((f) => f.path.toLowerCase() === current.toLowerCase())?.role ||
            res.folders.find((f) => f.path.toLowerCase() === current.toLowerCase())?.role
          const sameRole = rawRole ? folders.find((f) => f.role === rawRole) : undefined
          activeFolderRef.current = sameRole ? sameRole.path : 'INBOX'
          setActiveFolder(activeFolderRef.current)
          setSelectedEmail(null)
          if (sameRole && sameRole.path.toLowerCase() !== current.toLowerCase()) {
            loadEmails(sameRole.path, accId)
          }
        }
      }
    } catch (err) {
      if (reqSeq !== currentFoldersSeqRef.current) return
      console.error('[momai-emails] Error loading folders:', err)
    }
  }, [])

  // Clear sidebar unread badge ONLY when user is actively viewing this extension page
  useEffect(() => {
    if (isActive) {
      sdk.badge.clear('momai-emails')
    }
  }, [isActive])

  // Recount folder badges when the 24h/48h window changes (skips the first run)
  const windowReloadGuard = useRef(true)
  useEffect(() => {
    if (windowReloadGuard.current) {
      windowReloadGuard.current = false
      return
    }
    if (activeAccountId) loadFolders(activeAccountId)
  }, [settings.unreadWindowHours, activeAccountId, loadFolders])

  // 3. Load emails with SWR (0ms instant display from memory + localStorage cache, background refresh with cancellation)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false)
  const [isSearchMode, setIsSearchMode] = useState(false)
  const [page, setPage] = useState(0)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const PAGE_SIZE = EMAIL_PAGE_SIZE

  // Mirror of the server folder list for async callbacks without re-creating them.
  const foldersRef = useRef<EmailFolder[]>(folders)
  foldersRef.current = folders

  const viewingFavorites = isVirtualStarredFolder(activeFolder, folders)

  // Favorites view aggregates starred messages from every cached folder.
  const readCachedStarred = useCallback((accId: string): EmailMessage[] => {
    const seen = new Set<string>()
    const collected: EmailMessage[] = []
    for (const folder of foldersRef.current) {
      const cached =
        folderCacheRef.current.get(`${accId}:${folder.path}`) ||
        emailStorageCache.getFolderEmails(accId, folder.path)
      if (!cached) continue
      for (const msg of cached) {
        if (msg.accountId && msg.accountId !== accId) continue
        const key = `${msg.folder || folder.path}:${msg.id}`
        if (seen.has(key)) continue
        seen.add(key)
        collected.push(msg)
      }
    }
    return getStarredMessages(collected)
  }, [])

  // Real IMAP folder owning a message (the favorites view is virtual).
  const sourceFolderOf = (id: string): string => {
    const found =
      messages.find((m) => m.id === id) || (selectedEmail?.id === id ? selectedEmail : null)
    return found?.folder || activeFolder
  }

  // Keep the owning folder cache in sync when acting from the virtual favorites view.
  const syncOriginCache = (originFolder: string, id: string, patch: Partial<EmailMessage> | null) => {
    if (!activeAccountId) return
    const key = `${activeAccountId}:${originFolder}`
    const originList =
      folderCacheRef.current.get(key) ||
      emailStorageCache.getFolderEmails(activeAccountId, originFolder) ||
      []
    const synced = patch
      ? originList.map((m) => (m.id === id ? { ...m, ...patch } : m))
      : originList.filter((m) => m.id !== id)
    folderCacheRef.current.set(key, synced)
    emailStorageCache.setFolderEmails(activeAccountId, originFolder, synced)
  }

  const isDraftsFolderPath = (folderPath: string, folderList: EmailFolder[] = folders): boolean => {
    const match = folderList.find((f) => f.path.toLowerCase() === folderPath.toLowerCase())
    return isDraftsFolder(folderPath, match?.role)
  }

  const handleOpenDraft = async (msg: EmailMessage) => {
    const accId = activeAccountId || undefined
    const originFolder = msg.folder || activeFolder
    try {
      const res = await emailApi.readEmail(msg.id, originFolder, accId, false)
      const full = res?.ok && res.email ? res.email : msg
      const toAddrs = Array.isArray(full.to) ? full.to.map((a: any) => a.address || a).join(', ') : String((msg as any).to || '')
      setComposeInitialData({
        accountId: activeAccountId || undefined,
        to: typeof toAddrs === 'string' && toAddrs ? toAddrs : '',
        cc: Array.isArray(full.cc) ? full.cc.map((a: any) => a.address || a).join(', ') : undefined,
        bcc: Array.isArray(full.bcc) ? full.bcc.map((a: any) => a.address || a).join(', ') : undefined,
        subject: full.subject || msg.subject || '',
        body: full.html || full.text || msg.snippet || '',
        isHtml: Boolean(full.html),
        draftId: String(msg.id),
        draftFolder: originFolder,
        draftUid: typeof msg.uid === 'number' ? msg.uid : undefined
      })
    } catch {
      setComposeInitialData({
        accountId: activeAccountId || undefined,
        to: '',
        subject: msg.subject || '',
        body: (msg as any).text || msg.snippet || '',
        draftId: String(msg.id),
        draftFolder: originFolder,
        draftUid: typeof msg.uid === 'number' ? msg.uid : undefined
      })
    }
    setSelectedEmail(null)
    setIsComposeOpen(true)
  }

  // Warms the full body of a message in the background so opening it later
  // is instant. Never marks the message as read; opening still does that.
  const prefetchEmailBody = useCallback((msg: EmailMessage) => {
    const accId = activeAccountIdRef.current
    if (!accId || !msg?.id) return
    const originFolder = msg.folder || activeFolderRef.current
    const bodyKey = `${accId}:${msg.id}`
    if (emailBodyCacheRef.current.has(bodyKey)) return
    if (prefetchInflightRef.current.has(bodyKey)) return
    let cached = false
    try {
      cached = Boolean(emailStorageCache.getEmailBody(accId, msg.id))
    } catch {
      cached = false
    }
    if (cached) return
    prefetchInflightRef.current.add(bodyKey)
    emailApi.readEmail(msg.id, originFolder, accId, false).then((r) => {
      if (r?.ok && r.email) {
        const enriched = { ...r.email, accountId: r.email.accountId || accId }
        emailBodyCacheRef.current.set(bodyKey, enriched)
        try {
          emailStorageCache.setEmailBody(accId, msg.id, enriched)
        } catch {}
      }
    }).catch(() => {}).finally(() => {
      prefetchInflightRef.current.delete(bodyKey)
    })
  }, [])

  const loadEmails = useCallback(async (folder = 'INBOX', accId = activeAccountIdRef.current, silent = false, forceRefresh = false) => {
    if (!accId) return
    const reqSeq = ++currentReqSeqRef.current

    if (isVirtualStarredFolder(folder, foldersRef.current)) {
      setMessages(readCachedStarred(accId))
      setHasMoreMessages(false)
      setMessagesError(null)
      setIsSearchMode(false)
      setLoadingMessages(false)
      return
    }

    const cacheKey = `${accId}:${folder}`

    // 1st: check in-memory Map; 2nd: check persistent localStorage cache
    const rawCached = folderCacheRef.current.get(cacheKey) ?? emailStorageCache.getFolderEmails(accId, folder)
    const cached = rawCached ? rawCached.filter((m) => !m.accountId || m.accountId === accId) : null

    // SWR: If cached (even if empty []), display immediately in 0ms!
    if (cached !== null && cached !== undefined) {
      folderCacheRef.current.set(cacheKey, cached)
      setMessages(cached)
      if (isInboxFolder(folder)) {
        setFolders((prevFolders) => {
          const updated = syncInboxPrimaryUnread(prevFolders, cached, settings.showCategoryTabs, unreadWindowMs(settings.unreadWindowHours))
          if (accId) emailStorageCache.setFolders(accId, updated)
          return updated
        })
      }
      if (forceRefresh) {
        setLoadingMessages(true)
      } else {
        setLoadingMessages(false)
      }
    } else {
      // Clear previous folder messages immediately so they don't leak into the new folder view
      setMessages([])
      if (!silent) {
        setLoadingMessages(true)
      }
    }
    setMessagesError(null)
    setIsSearchMode(false)

    try {
      const fetchLimit = isInboxFolder(folder) ? 80 : PAGE_SIZE
      const res = await emailApi.listEmails(folder, accId, fetchLimit, false, 0)
      // Discard if user already switched to another folder or account
      if (reqSeq !== currentReqSeqRef.current || accId !== activeAccountIdRef.current) return

      if (res && res.ok && Array.isArray(res.messages)) {
        const stampedMessages = res.messages.map((m: EmailMessage) => ({ ...m, accountId: m.accountId || accId }))
        // Merge over the same-folder list instead of replacing: a refresh only
        // brings the newest window, so replacing would erase already loaded
        // messages and visibly shrink the Principal tab.
        const prevList = cached ?? []
        const mergedMessages =
          stampedMessages.length > 0
            ? mergeFolderMessages(prevList, stampedMessages, 500)
            : []
        folderCacheRef.current.set(cacheKey, mergedMessages)
        emailStorageCache.setFolderEmails(accId, folder, mergedMessages)
        setMessages(mergedMessages)
        setHasMoreMessages(Boolean(res.hasMore))

        if (isInboxFolder(folder)) {
          setFolders((prevFolders) => {
            const updated = syncInboxPrimaryUnread(prevFolders, mergedMessages, settings.showCategoryTabs, unreadWindowMs(settings.unreadWindowHours))
            if (accId) emailStorageCache.setFolders(accId, updated)
            return updated
          })
        }

        // Background pre-fetch top email body so opening is instantaneous
        const topMsg = mergedMessages[0]
        if (topMsg) {
          prefetchEmailBody(topMsg)
        }
      } else if (!cached) {
        setMessagesError(t('page.errors.loadMessages'))
      }
    } catch (err: any) {
      if (reqSeq !== currentReqSeqRef.current || accId !== activeAccountIdRef.current) return
      if (!cached) {
        setMessagesError(err?.message || t('page.errors.connection'))
      }
    } finally {
      if (reqSeq === currentReqSeqRef.current && accId === activeAccountIdRef.current) {
        setLoadingMessages(false)
      }
    }
  }, [readCachedStarred, prefetchEmailBody])

  // Load more messages (next page) — appends to current list
  const loadMoreEmails = useCallback(async () => {
    const currentAccId = activeAccountIdRef.current
    const currentFolder = activeFolderRef.current
    if (!currentAccId || loadingMoreMessages || !hasMoreMessages || isSearchMode) return
    if (isVirtualStarredFolder(currentFolder, foldersRef.current)) return

    const reqSeq = currentReqSeqRef.current
    setLoadingMoreMessages(true)
    try {
      const offset = messages.length
      const res = await emailApi.listEmails(currentFolder, currentAccId, PAGE_SIZE, false, offset)

      // Guard: if user switched account or folder while request was in-flight, discard!
      if (
        reqSeq !== currentReqSeqRef.current ||
        currentAccId !== activeAccountIdRef.current ||
        currentFolder !== activeFolderRef.current
      ) {
        return
      }

      if (res && res.ok && Array.isArray(res.messages) && res.messages.length > 0) {
        const stampedNew = res.messages.map((m: EmailMessage) => ({ ...m, accountId: m.accountId || currentAccId }))
        setMessages((prevMessages) => {
          // Strictly ensure previous messages belong to this account
          const validPrev = prevMessages.filter((m) => !m.accountId || m.accountId === currentAccId)
          const existingIds = new Set(validPrev.map((m) => m.id))
          const newMsgs = stampedNew.filter((m) => !existingIds.has(m.id))
          if (newMsgs.length === 0) return validPrev

          const merged = [...validPrev, ...newMsgs]
          const cacheKey = `${currentAccId}:${currentFolder}`
          folderCacheRef.current.set(cacheKey, merged)
          emailStorageCache.setFolderEmails(currentAccId, currentFolder, merged)
          return merged
        })
        setHasMoreMessages(Boolean(res.hasMore))
      } else {
        setHasMoreMessages(false)
      }
    } catch {
      // Silently fail on load more — user can scroll again to retry
    } finally {
      if (currentAccId === activeAccountIdRef.current) {
        setLoadingMoreMessages(false)
      }
    }
  }, [hasMoreMessages, isSearchMode, loadingMoreMessages, messages.length])

  // Server-side IMAP search (debounced)
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
    setPage(0)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)

    if (query.trim()) {
      setSelectedEmail(null)
    }

    if (!query.trim()) {
      // Exit search mode — restore normal folder emails
      setIsSearchMode(false)
      if (isVirtualStarredFolder(activeFolder, foldersRef.current)) {
        if (activeAccountId) setMessages(readCachedStarred(activeAccountId))
        setHasMoreMessages(false)
        return
      }
      const cacheKey = `${activeAccountId}:${activeFolder}`
      const cached = folderCacheRef.current.get(cacheKey) || emailStorageCache.getFolderEmails(activeAccountId || '', activeFolder)
      if (cached) setMessages(cached)
      setHasMoreMessages(true)
      return
    }

    // Favorites view filters the aggregated starred messages locally.
    if (isVirtualStarredFolder(activeFolder, foldersRef.current)) {
      const term = query.trim().toLowerCase()
      const starred = activeAccountId ? readCachedStarred(activeAccountId) : []
      setIsSearchMode(true)
      setHasMoreMessages(false)
      setMessages(
        starred.filter((msg) =>
          msg.subject?.toLowerCase().includes(term) ||
          msg.from?.name?.toLowerCase().includes(term) ||
          msg.from?.address?.toLowerCase().includes(term) ||
          msg.snippet?.toLowerCase().includes(term)
        )
      )
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
      loadFolders(activeAccountId)
      loadEmails(activeFolder, activeAccountId)
    } else {
      setFolders([])
      setMessages([])
      setSelectedEmail(null)
    }
  }, [activeAccountId, activeFolder, loadFolders, loadEmails])

  // 4. Real-time updates: listen to new incoming emails and dispatch native OS notification
  useExtensionEvents({
    onEvent: (event: any) => {
      if (!event || event.eventType !== 'new_email') return
      const { accountId, subject, from, messageId } = event.data || {}

      // Extrai apenas o nome do remetente limpo para a notificação
      let senderName = t('notifications.newEmail')
      if (typeof from === 'object' && from !== null) {
        senderName = from.name || from.address || t('notifications.newEmail')
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

      // If the incoming email belongs to the active account, refresh inbox and folders with debouncing
      if (accountId === activeAccountId) {
        if (burstReloadTimerRef.current) clearTimeout(burstReloadTimerRef.current)
        burstReloadTimerRef.current = setTimeout(() => {
          burstReloadTimerRef.current = null
          if (activeFolder.toUpperCase() === 'INBOX') {
            loadEmails(activeFolder, activeAccountId, true)
          }
          loadFolders(activeAccountId || undefined)
        }, 600)
      }

      // Sidebar dot only for wanted categories (Primary-only by default)
      if (!isActive) {
        const category =
          (event.data && event.data.category) ||
          classifyEmailCategory({ from: typeof from === 'string' ? from : undefined, subject })
        if (shouldNotifyForCategory(category, loadEmailSettings().notifyPrimaryOnly)) {
          sdk.badge.set(true, 'momai-emails')
        }
      }
    }
  })

  // 5. Account operations
  const handleSelectAccount = useCallback(async (id: string) => {
    if (!id || id === activeAccountIdRef.current) return
    prewarmerRef.current.stop()
    activeAccountIdRef.current = id
    currentReqSeqRef.current++
    currentFoldersSeqRef.current++

    startTransition(() => {
      setActiveAccountId(id)
      setActiveFolder('INBOX')
      setSelectedEmail(null)
      setShowSettings(false)
      setSearchQuery('')
      setIsSearchMode(false)
      setHasMoreMessages(false)
      setLoadingMoreMessages(false)
      setMessagesError(null)
      setPage(0)
      setAccounts((prev) => prev.map((a) => ({ ...a, active: a.id === id })))
    })

    // Load cached folders and emails for the new account immediately in 0ms
    const cachedFolders = emailStorageCache.getFolders(id)
    if (cachedFolders && cachedFolders.length > 0) {
      setFolders(dedupeFoldersByRole(cachedFolders))
    } else {
      setFolders([])
    }

    const rawCachedEmails = folderCacheRef.current.get(`${id}:INBOX`) || emailStorageCache.getFolderEmails(id, 'INBOX')
    const cachedEmails = rawCachedEmails ? rawCachedEmails.filter((m) => !m.accountId || m.accountId === id) : null
    if (cachedEmails && cachedEmails.length > 0) {
      setMessages(cachedEmails)
      setLoadingMessages(false)
    } else {
      setMessages([])
      setLoadingMessages(true)
    }

    try {
      await emailApi.setActiveAccount(id)
    } catch {}
  }, [])

  const handleSaveAccount = async (data: any) => {
    const res = await emailApi.addAccount(data)
    if (res.ok) {
      await loadAccounts()
      if (res.account?.id) {
        handleSelectAccount(res.account.id)
      }
    }
    return res
  }

  const handleRemoveAccount = async (id: string) => {
    const res = await emailApi.removeAccount(id)
    if (res.ok) {
      try {
        const { defaultAvatarStore, removeAvatar } = await import('./services/avatar-storage')
        removeAvatar(defaultAvatarStore(), id)
      } catch {}
      await loadAccounts({ allowEmpty: true })
    }
  }

  // 6. Message actions (Instant 0ms opening via body cache + optimistic UI updates)
  const handleSelectEmail = async (msg: EmailMessage) => {
    const origin = msg.folder || activeFolder
    if (isDraftsFolderPath(origin)) {
      await handleOpenDraft(msg)
      return
    }
    const accId = activeAccountId || undefined
    const cacheKey = `${accId}:${msg.id}`
    const cached = emailBodyCacheRef.current.get(cacheKey) || (accId ? emailStorageCache.getEmailBody(accId, msg.id) : null)

    // SWR: If full email body is in cache, check if attachments need preview enrichment
    const hasUnenrichedAttachments = Boolean(
      cached &&
      cached.attachments &&
      cached.attachments.some(
        (a: any) =>
          (a.filename?.toLowerCase().endsWith('.pdf') ||
            a.contentType?.includes('pdf') ||
            a.contentType?.startsWith('image/')) &&
          !a.base64Data &&
          !a.previewDataUrl
      )
    )

    const shouldAutoMarkRead = !msg.read && settings.autoMarkRead
    const originFolder = msg.folder || activeFolder
    const isPrimaryMsg = !settings.showCategoryTabs || classifyEmailCategory(msg) === 'primary'
    const shouldAdjustFolder = !isInboxFolder(originFolder) || isPrimaryMsg

    if (shouldAutoMarkRead) {
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, read: true } : m))
      )
      if (activeAccountId && shouldAdjustFolder) {
        setFolders((prevFolders) => {
          const updated = adjustFolderUnread(prevFolders, originFolder, -1)
          emailStorageCache.setFolders(activeAccountId, updated)
          return updated
        })
      }
      if (activeAccountId) {
        syncOriginCache(originFolder, msg.id, { read: true })
        const fKey = `${activeAccountId}:${activeFolder}`
        const cachedF = folderCacheRef.current.get(fKey)
        if (cachedF && !viewingFavorites) {
          folderCacheRef.current.set(fKey, cachedF.map((m) => (m.id === msg.id ? { ...m, read: true } : m)))
        }
      }
      sdk.badge.clear('momai-emails')
    }

    if (cached && !hasUnenrichedAttachments) {
      const displayEmail = { ...cached, read: true }
      emailBodyCacheRef.current.set(cacheKey, displayEmail)
      setSelectedEmail(displayEmail)
      setLoadingEmailContent(false)
      if (shouldAutoMarkRead) {
        emailApi.markAsRead(msg.id, originFolder, activeAccountId || undefined).catch(() => {})
      }
      return
    }

    if (cached) {
      setSelectedEmail({ ...cached, read: shouldAutoMarkRead ? true : cached.read })
    } else {
      setSelectedEmail({ ...msg, read: shouldAutoMarkRead ? true : msg.read })
      setLoadingEmailContent(true)
    }
    try {
      const res = await emailApi.readEmail(msg.id, originFolder, accId, settings.autoMarkRead)
      if (res.ok && res.email) {
        const enriched = { ...res.email, read: true }
        emailBodyCacheRef.current.set(cacheKey, enriched)
        if (accId) {
          emailStorageCache.setEmailBody(accId, msg.id, enriched)
        }
        setSelectedEmail(enriched)
      }
    } catch (err) {
      console.error('[momai-emails] Error loading full email:', err)
    } finally {
      setLoadingEmailContent(false)
    }
  }

  const handleToggleStarred = async (id: string, currentStarred: boolean) => {
    const newStarred = !currentStarred
    const originFolder = sourceFolderOf(id)
    const leavingFavorites = viewingFavorites && !newStarred
    setMessages((prev) => {
      const starred = prev.map((m) => (m.id === id ? { ...m, starred: newStarred } : m))
      const updated = leavingFavorites ? starred.filter((m) => m.id !== id) : starred
      if (activeAccountId && !viewingFavorites) {
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
    if (cached && !viewingFavorites) {
      folderCacheRef.current.set(cacheKey, cached.map((m) => (m.id === id ? { ...m, starred: newStarred } : m)))
    }
    syncOriginCache(originFolder, id, { starred: newStarred })
    emailApi.toggleStarred(id, newStarred, originFolder, activeAccountId || undefined).catch(() => {})
  }

  const handleMarkRead = async (id: string) => {
    const target = messages.find((m) => m.id === id) || (selectedEmail?.id === id ? selectedEmail : null)
    const originFolder = target?.folder || activeFolder
    const isPrimaryTarget = !settings.showCategoryTabs || !target || classifyEmailCategory(target) === 'primary'
    const shouldAdjust = !isInboxFolder(originFolder) || isPrimaryTarget
    const delta = target && !target.read && shouldAdjust ? -1 : 0
    setMessages((prev) => {
      const updated = prev.map((m) => (m.id === id ? { ...m, read: true } : m))
      if (activeAccountId && !viewingFavorites) {
        emailStorageCache.setFolderEmails(activeAccountId, activeFolder, updated)
      }
      return updated
    })
    if (delta !== 0 && activeAccountId) {
      setFolders((prev) => {
        const updated = adjustFolderUnread(prev, originFolder, delta)
        emailStorageCache.setFolders(activeAccountId, updated)
        return updated
      })
    }
    if (selectedEmail?.id === id) {
      setSelectedEmail({ ...selectedEmail, read: true })
    }
    sdk.badge.clear('momai-emails')
    // Update folder cache
    const cacheKey = `${activeAccountId}:${activeFolder}`
    const cached = folderCacheRef.current.get(cacheKey)
    if (cached && !viewingFavorites) {
      folderCacheRef.current.set(cacheKey, cached.map((m) => (m.id === id ? { ...m, read: true } : m)))
    }
    syncOriginCache(originFolder, id, { read: true })
    emailApi.markAsRead(id, originFolder, activeAccountId || undefined).catch(() => {})
  }

  const handleMarkUnread = async (id: string) => {
    const target = messages.find((m) => m.id === id) || (selectedEmail?.id === id ? selectedEmail : null)
    const originFolder = target?.folder || activeFolder
    const isPrimaryTarget = !settings.showCategoryTabs || !target || classifyEmailCategory(target) === 'primary'
    const shouldAdjust = !isInboxFolder(originFolder) || isPrimaryTarget
    const delta = target && target.read && shouldAdjust ? 1 : 0
    setMessages((prev) => {
      const updated = prev.map((m) => (m.id === id ? { ...m, read: false } : m))
      if (activeAccountId && !viewingFavorites) {
        emailStorageCache.setFolderEmails(activeAccountId, activeFolder, updated)
      }
      return updated
    })
    if (delta !== 0 && activeAccountId) {
      setFolders((prev) => {
        const updated = adjustFolderUnread(prev, originFolder, delta)
        emailStorageCache.setFolders(activeAccountId, updated)
        return updated
      })
    }
    if (selectedEmail?.id === id) {
      setSelectedEmail({ ...selectedEmail, read: false })
      setSelectedEmail(null) // Return to list if marked unread from reader
    }
    // Update folder cache
    const cacheKey = `${activeAccountId}:${activeFolder}`
    const cached = folderCacheRef.current.get(cacheKey)
    if (cached && !viewingFavorites) {
      folderCacheRef.current.set(cacheKey, cached.map((m) => (m.id === id ? { ...m, read: false } : m)))
    }
    syncOriginCache(originFolder, id, { read: false })
    emailApi.markAsUnread(id, originFolder, activeAccountId || undefined).catch(() => {})
  }

  const handleDelete = async (id: string) => {
    const target = messages.find((m) => m.id === id) || (selectedEmail?.id === id ? selectedEmail : null)
    const originFolder = target?.folder || activeFolder
    const delta = target && !target.read ? -1 : 0
    setMessages((prev) => {
      const updated = prev.filter((m) => m.id !== id)
      if (activeAccountId && !viewingFavorites) {
        emailStorageCache.setFolderEmails(activeAccountId, activeFolder, updated)
      }
      return updated
    })
    if (delta !== 0 && activeAccountId) {
      setFolders((prev) => {
        const updated = adjustFolderUnread(prev, originFolder, delta)
        emailStorageCache.setFolders(activeAccountId, updated)
        return updated
      })
    }
    if (selectedEmail?.id === id) {
      setSelectedEmail(null)
    }
    sdk.badge.clear('momai-emails')
    // Update folder cache
    const cacheKey = `${activeAccountId}:${activeFolder}`
    const cached = folderCacheRef.current.get(cacheKey)
    if (cached && !viewingFavorites) {
      folderCacheRef.current.set(cacheKey, cached.filter((m) => m.id !== id))
    }
    syncOriginCache(originFolder, id, null)
    if (activeAccountId && target?.messageId) {
      const originRole = folders.find((f) => f.path.toLowerCase() === originFolder.toLowerCase())?.role
      if (isDraftsFolder(originFolder, originRole)) {
        rememberDraftMessage(activeAccountId, target.messageId)
      } else if (isTrashFolder(originFolder, originRole)) {
        forgetDraftMessage(activeAccountId, target.messageId)
      }
    }
    emailApi.deleteEmail(id, originFolder, activeAccountId || undefined).catch(() => {})
  }

  const handleBatchDelete = async (ids: string[]) => {
    const idSet = new Set(ids)
    const unreadByFolder = new Map<string, number>()
    for (const m of messages) {
      if (idSet.has(m.id) && !m.read) {
        const origin = m.folder || activeFolder
        unreadByFolder.set(origin, (unreadByFolder.get(origin) || 0) + 1)
      }
    }
    setMessages((prev) => {
      const updated = prev.filter((m) => !idSet.has(m.id))
      if (activeAccountId && !viewingFavorites) {
        emailStorageCache.setFolderEmails(activeAccountId, activeFolder, updated)
      }
      return updated
    })
    if (unreadByFolder.size > 0 && activeAccountId) {
      setFolders((prev) => {
        let updated = prev
        for (const [origin, count] of unreadByFolder) {
          updated = adjustFolderUnread(updated, origin, -count)
        }
        emailStorageCache.setFolders(activeAccountId, updated)
        return updated
      })
    }
    if (selectedEmail && idSet.has(selectedEmail.id)) {
      setSelectedEmail(null)
    }
    for (const id of ids) {
      const originFolder = sourceFolderOf(id)
      syncOriginCache(originFolder, id, null)
      if (activeAccountId) {
        const originRole = folders.find((f) => f.path.toLowerCase() === originFolder.toLowerCase())?.role
        const targetMessageId = messages.find((m) => m.id === id)?.messageId
        if (targetMessageId) {
          if (isDraftsFolder(originFolder, originRole)) {
            rememberDraftMessage(activeAccountId, targetMessageId)
          } else if (isTrashFolder(originFolder, originRole)) {
            forgetDraftMessage(activeAccountId, targetMessageId)
          }
        }
      }
      await emailApi.deleteEmail(id, originFolder, activeAccountId || undefined)
    }
  }

  const handleBatchMarkRead = async (ids: string[]) => {
    const idSet = new Set(ids)
    const unreadByFolder = new Map<string, number>()
    for (const m of messages) {
      if (idSet.has(m.id) && !m.read) {
        const origin = m.folder || activeFolder
        unreadByFolder.set(origin, (unreadByFolder.get(origin) || 0) + 1)
      }
    }
    setMessages((prev) => {
      const updated = prev.map((m) => (idSet.has(m.id) ? { ...m, read: true } : m))
      if (activeAccountId && !viewingFavorites) {
        emailStorageCache.setFolderEmails(activeAccountId, activeFolder, updated)
      }
      return updated
    })
    if (unreadByFolder.size > 0 && activeAccountId) {
      setFolders((prev) => {
        let updated = prev
        for (const [origin, count] of unreadByFolder) {
          updated = adjustFolderUnread(updated, origin, -count)
        }
        emailStorageCache.setFolders(activeAccountId, updated)
        return updated
      })
    }
    for (const id of ids) {
      const originFolder = sourceFolderOf(id)
      syncOriginCache(originFolder, id, { read: true })
      await emailApi.markAsRead(id, originFolder, activeAccountId || undefined)
    }
  }

  const handleMoveEmail = async (id: string, toFolder: string) => {
    const fromFolder = sourceFolderOf(id)
    if (!toFolder || toFolder.toLowerCase() === fromFolder.toLowerCase()) return
    const target = messages.find((m) => m.id === id) || (selectedEmail?.id === id ? selectedEmail : null)
    const movingToArchive = isArchiveFolder(toFolder)
    const originKey = target ? archiveMessageKey(target.messageId, target.id) : archiveMessageKey(null, id)
    const delta = target && !target.read ? -1 : 0
    setMessages((prev) => {
      const updated = prev.filter((m) => m.id !== id)
      if (activeAccountId && !viewingFavorites) {
        emailStorageCache.setFolderEmails(activeAccountId, activeFolder, updated)
      }
      return updated
    })
    if (delta !== 0 && activeAccountId) {
      setFolders((prev) => {
        const updated = adjustFolderUnread(prev, fromFolder, delta)
        emailStorageCache.setFolders(activeAccountId, updated)
        return updated
      })
    }
    if (selectedEmail?.id === id) {
      setSelectedEmail(null)
    }
    if (activeAccountId) {
      emailBodyCacheRef.current.delete(`${activeAccountId}:${id}`)
      try {
        window.localStorage?.removeItem(`momai_emails_v1_body_${activeAccountId}_${id}`)
      } catch {}
      const cacheKey = `${activeAccountId}:${activeFolder}`
      const cached = folderCacheRef.current.get(cacheKey)
      if (cached && !viewingFavorites) {
        folderCacheRef.current.set(cacheKey, cached.filter((m) => m.id !== id))
      }
      syncOriginCache(fromFolder, id, null)
    }
    try {
      const res = await emailApi.moveEmail(id, toFolder, fromFolder, activeAccountId || undefined)
      if (!res?.ok) {
        loadEmails(activeFolder, activeAccountId || undefined, true)
        return
      }
      if (activeAccountId) {
        const accId = activeAccountId
        if (movingToArchive && originKey) {
          setArchiveOrigin(accId, originKey, fromFolder)
        }
        const destKey = `${accId}:${toFolder}`
        folderCacheRef.current.delete(destKey)
        void emailApi
          .listEmails(toFolder, accId, 50, false, 0)
          .then((r) => {
            if (r?.ok && Array.isArray(r.messages)) {
              const stamped = r.messages.map((m: EmailMessage) => ({
                ...m,
                accountId: m.accountId || accId
              }))
              folderCacheRef.current.set(destKey, stamped)
              try {
                emailStorageCache.setFolderEmails(accId, toFolder, stamped)
              } catch {}
              if (!viewingFavorites && activeFolderRef.current?.toLowerCase() === toFolder.toLowerCase()) {
                setMessages(stamped)
              }
            }
          })
          .catch(() => {})
      }
    } catch {
      loadEmails(activeFolder, activeAccountId || undefined, true)
    }
  }

  const handleNotSpam = async (id: string) => {
    const inboxPath = resolveInboxPath(folders, 'INBOX')
    await handleMoveEmail(id, inboxPath)
  }

  const handleRestore = async (id: string) => {
    const target = messages.find((m) => m.id === id) || (selectedEmail?.id === id ? selectedEmail : null)
    const key = target ? archiveMessageKey(target.messageId, target.id) : archiveMessageKey(null, id)
    const saved = activeAccountId && key ? getArchiveOrigin(activeAccountId, key) : null
    const destination = saved || resolveInboxPath(folders, 'INBOX')
    if (activeAccountId && key) clearArchiveOrigin(activeAccountId, key)
    await handleMoveEmail(id, destination)
  }

  const handleBatchRestore = async (ids: string[]) => {
    for (const id of ids) {
      await handleRestore(id)
    }
  }

  const handleSyncNow = useCallback(async () => {
    setSyncing(true)
    try {
      await emailApi.sync()
      await loadFolders(activeAccountId || undefined)
      await loadEmails(activeFolder, activeAccountId || undefined, true)
    } catch {
      // Sync failures surface through the list error state.
    } finally {
      setSyncing(false)
    }
  }, [activeAccountId, activeFolder, loadFolders, loadEmails])

  // 7. Open Document Attachment with OS Default App
  const handleOpenAttachment = async (msg: EmailMessage, attachment: EmailAttachment) => {
    try {
      const res = await emailApi.openAttachment({
        messageId: msg.id || msg.uid,
        filename: attachment.filename,
        part: attachment.part,
        folder: msg.folder || activeFolder,
        accountId: activeAccountId || undefined
      })
      if (!res.ok) {
        console.warn('[momai-emails] Falha ao abrir anexo:', res.error)
      }
      return res
    } catch (err) {
      console.error('[momai-emails] Erro ao abrir anexo:', err)
      return { ok: false, error: String(err) }
    }
  }

  // 7.1 Save Document Attachment with Native OS Dialog
  const handleSaveAttachment = async (msg: EmailMessage, attachment: EmailAttachment) => {
    try {
      const res = await emailApi.saveAttachment({
        messageId: msg.id || msg.uid,
        filename: attachment.filename,
        part: attachment.part,
        folder: msg.folder || activeFolder,
        accountId: activeAccountId || undefined
      })
      if (!res.ok && !res.cancelled) {
        console.warn('[momai-emails] Falha ao salvar anexo:', res.error)
      }
      return res
    } catch (err) {
      console.error('[momai-emails] Erro ao salvar anexo:', err)
      return { ok: false, error: String(err) }
    }
  }

  // 8. Compose & Reply actions
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
      body: `\n\n${t('page.replyQuote', { date: email.date, name: email.from.name || email.from.address })}\n> ${email.text || email.snippet}`
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
      body: `\n\n---------- ${t('page.forwardHeader')} ----------\n${t('page.forwardFrom')}: ${email.from.name || email.from.address}\n${t('page.forwardDate')}: ${email.date}\n${t('page.forwardSubject')}: ${email.subject}\n${t('page.forwardTo')}: ${email.to.map((t) => t.address).join(', ')}\n\n${email.text || email.snippet}`
    })
    setIsComposeOpen(true)
  }

  // Background draft notice hides itself a few seconds after each update.
  useEffect(() => {
    if (!draftNotice) return
    const timer = setTimeout(() => setDraftNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [draftNotice])

  // Background send notice stays visible while sending and hides after sent/failed.
  useEffect(() => {
    if (!sendNotice || sendNotice === 'sending') return
    const timer = setTimeout(() => setSendNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [sendNotice])

  const handleSaveDraft = async (payload: SendEmailPayload & { replaceUid?: number; replaceFolder?: string }) => {
    const viewingDrafts = isDraftsFolderPath(activeFolderRef.current, foldersRef.current)
    const saveAccountId = payload.accountId || activeAccountId || undefined
    const accountEmail = accounts.find((a) => a.id === saveAccountId)?.email || ''
    const pending = viewingDrafts
      ? buildPendingDraft({
        to: payload.to,
        subject: payload.subject,
        body: payload.body,
        accountEmail,
        draftsFolder: payload.replaceFolder ?? payload.draftFolder ?? resolveDraftsPath(foldersRef.current)
      })
      : null
    if (pending) {
      setMessages((prev) => [pending, ...prev.filter((m) => m.id !== pending.id)])
    }
    setDraftNotice('saving')
    let res: { ok: boolean; draftsFolder?: string; error?: string }
    try {
      res = await emailApi.saveDraft({
        accountId: saveAccountId,
        to: payload.to,
        subject: payload.subject,
        body: payload.body,
        isHtml: payload.isHtml,
        cc: payload.cc,
        bcc: payload.bcc,
        inReplyTo: payload.inReplyTo,
        references: payload.references,
        attachments: payload.attachments,
        replaceUid: payload.replaceUid ?? payload.draftUid,
        replaceFolder: payload.replaceFolder ?? payload.draftFolder
      })
    } catch {
      res = { ok: false }
    }
    if (res.ok) {
      setDraftNotice('saved')
      if (viewingDrafts) {
        await loadEmails(activeFolderRef.current, activeAccountIdRef.current || undefined, true)
        if (pending) {
          setMessages((prev) => removePendingDrafts(prev, [pending.id]))
        }
      }
      loadFolders(activeAccountIdRef.current || undefined)
    } else {
      if (pending) {
        setMessages((prev) => removePendingDrafts(prev, [pending.id]))
      }
      setDraftNotice('failed')
    }
    return res
  }

  const handleSendEmail = async (payload: SendEmailPayload) => {
    setSendNotice('sending')
    let res: { ok: boolean; messageId?: string; error?: string }
    try {
      res = await emailApi.sendEmail(payload)
    } catch (err: any) {
      res = { ok: false, error: err?.message || 'send failed' }
    }
    if (res.ok) {
      setSendNotice('sent')
      const sentDraftId = (payload as SendEmailPayload).draftId
      const sentDraftFolder = (payload as SendEmailPayload).draftFolder
      if (sentDraftId && sentDraftFolder) {
        emailApi.deleteEmail(String(sentDraftId), sentDraftFolder, activeAccountId || undefined).catch(() => {})
        if (isDraftsFolderPath(sentDraftFolder)) {
          loadEmails(activeFolder, activeAccountId || undefined, true)
        }
      }
      // Refresh current folder if in sent folder
      if (activeFolder.toLowerCase().includes('sent') || activeFolder.toLowerCase().includes('enviad')) {
        loadEmails(activeFolder, activeAccountId || undefined)
      }
    } else {
      setSendNotice('failed')
      setComposeInitialData({ ...payload })
      setIsComposeOpen(true)
    }
    return res
  }

  const handleQuickSendReply = async (body: string): Promise<boolean> => {
    if (!selectedEmail) return false
    const replySubject = selectedEmail.subject.startsWith('Re:')
      ? selectedEmail.subject
      : `Re: ${selectedEmail.subject}`

    setSendNotice('sending')
    let res: { ok: boolean; error?: string }
    try {
      res = await emailApi.sendEmail({
        accountId: activeAccountId || undefined,
        to: selectedEmail.replyTo?.[0]?.address || selectedEmail.from.address,
        subject: replySubject,
        body,
        inReplyTo: selectedEmail.messageId,
        references: selectedEmail.messageId
      })
    } catch {
      res = { ok: false }
    }
    if (res.ok) {
      setSendNotice('sent')
      return true
    }
    setSendNotice('failed')
    return false
  }

  // Handle Escape key globally in page for reader back, settings close, or cancel add-account
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isComposeOpen) return
        if (isAddingAccount && accounts.length > 0) {
          setIsAddingAccount(false)
        } else if (showSettings) {
          setShowSettings(false)
        } else if (selectedEmail) {
          setSelectedEmail(null)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isComposeOpen, isAddingAccount, accounts.length, showSettings, selectedEmail])

  // While the first account load is pending, hold a loading view so a slow
  // worker never flashes the provider onboarding view over a real inbox.
  if (accountsLoading && accounts.length === 0 && !isAddingAccount) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-bg text-text select-none">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-xs text-text-muted">{t('page.loadingAccounts')}</p>
      </div>
    )
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
      {/* 1. Header with Provider Logo (left), Centered Search (center), and Profile Switcher (right) */}
      <EmailsHeader
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSelectAccount={handleSelectAccount}
        onOpenAddModal={() => setIsAddingAccount(true)}
        onRemoveAccount={handleRemoveAccount}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onOpenSettings={() => setShowSettings((prev) => !prev)}
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
            setShowSettings(false)
            setSearchQuery('')
            setIsSearchMode(false)
            setPage(0)
            const currentAcc = activeAccountIdRef.current
            if (currentAcc) {
              if (isVirtualStarredFolder(folderPath, foldersRef.current)) {
                setMessages(readCachedStarred(currentAcc))
                setLoadingMessages(false)
              } else {
                const cacheKey = `${currentAcc}:${folderPath}`
                const cached = folderCacheRef.current.get(cacheKey) ?? emailStorageCache.getFolderEmails(currentAcc, folderPath)
                if (cached !== null && cached !== undefined) {
                  setMessages(cached)
                  setLoadingMessages(false)
                } else {
                  setMessages([])
                  setLoadingMessages(true)
                }
              }
            }
          }}
          onOpenCompose={handleOpenCompose}
        />

        {/* Content View: Settings page, EmailReader or EmailList */}
        {showSettings ? (
          <EmailSettings
            accountEmail={accounts.find((a) => a.id === activeAccountId)?.email || ''}
            providerName={
              (() => {
                const acc = accounts.find((a) => a.id === activeAccountId)
                if (!acc) return ''
                const pid = (acc.provider as keyof typeof PROVIDERS) || detectProviderFromEmail(acc.email)
                return (PROVIDERS[pid] || PROVIDERS.custom).name
              })()
            }
            unreadCount={getFolderDisplayUnread(
              folders.find((f) => f.path.toLowerCase() === 'inbox') || { unreadCount: 0 }
            )}
            windowHours={settings.unreadWindowHours}
            settings={settings}
            syncing={syncing}
            onChange={handleSettingsChange}
            onSync={handleSyncNow}
            onBack={() => setShowSettings(false)}
          />
        ) : selectedEmail ? (
          <EmailReader
            email={selectedEmail}
            loading={loadingEmailContent}
            onBack={() => setSelectedEmail(null)}
            onReply={handleReply}
            onForward={handleForward}
            onDelete={handleDelete}
            onMarkUnread={handleMarkUnread}
            onQuickSendReply={handleQuickSendReply}
            onOpenAttachment={(email, att) => handleOpenAttachment(email, att)}
            onSaveAttachment={(email, att) => handleSaveAttachment(email, att)}
            activeFolder={activeFolder}
            folders={folders}
            onToggleStarred={handleToggleStarred}
            onMove={handleMoveEmail}
            onNotSpam={handleNotSpam}
            onRestore={handleRestore}
          />
        ) : (
          <EmailList
            key={`${activeAccountId || 'none'}:${activeFolder}`}
            messages={messages}
            loading={loadingMessages}
            error={messagesError}
            activeFolder={activeFolder}
            selectedEmailId={selectedEmail ? (selectedEmail as EmailMessage).id : null}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            onRefresh={() => {
              setPage(0)
              loadEmails(activeFolder, activeAccountId || undefined, false, true)
              loadFolders(activeAccountId || undefined)
            }}
            onSelectEmail={handleSelectEmail}
            onPrefetchEmail={prefetchEmailBody}
            onToggleStarred={handleToggleStarred}
            onMarkRead={handleMarkRead}
            onMarkUnread={handleMarkUnread}
            onDelete={handleDelete}
            onBatchDelete={handleBatchDelete}
            onBatchMarkRead={handleBatchMarkRead}
            onRestore={handleRestore}
            onBatchRestore={handleBatchRestore}
            onOpenAttachment={handleOpenAttachment}
            folders={folders}
            onReply={(msg) => handleReply(msg, false)}
            onMove={handleMoveEmail}
            onNotSpam={handleNotSpam}
            hasMore={hasMoreMessages}
            loadingMore={loadingMoreMessages}
            onLoadMore={loadMoreEmails}
            totalCount={folders.find((f) => f.path.toLowerCase() === activeFolder.toLowerCase())?.totalCount || messages.length}
            showCategoryTabs={settings.showCategoryTabs}
            unreadWindowMs={unreadWindowMs(settings.unreadWindowHours)}
            pageSize={EMAIL_PAGE_SIZE}
            page={page}
            onPageChange={setPage}
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
        onSaveDraft={handleSaveDraft}
      />

      {/* Background draft-save notice (the composer already closed) */}
      {draftNotice && (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-card border border-border shadow-glass-lg text-xs text-text animate-fade-in">
          {draftNotice === 'saving' && (
            <div className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          )}
          <span>
            {draftNotice === 'saving'
              ? t('composer.savingDraft')
              : draftNotice === 'saved'
                ? t('composer.draftSaved')
                : t('composer.draftSaveFailed')}
          </span>
        </div>
      )}

      {/* Background send notice (the composer already closed) */}
      {sendNotice && (
        <div className="fixed bottom-16 left-4 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-card border border-border shadow-glass-lg text-xs text-text animate-fade-in">
          {sendNotice === 'sending' && (
            <div className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          )}
          <span>
            {sendNotice === 'sending'
              ? t('composer.sending')
              : sendNotice === 'sent'
                ? t('composer.sent')
                : t('composer.errors.sendFailed')}
          </span>
        </div>
      )}
    </div>
  )
}

// Register renderer with MomAI platform
sdk.registry.registerRenderer('momai-emails-page', EmailsPage)

export default EmailsPage
