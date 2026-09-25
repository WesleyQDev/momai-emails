// src/components/EmailList.tsx
// Message list view with infinite scroll and server-side search

import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  StarIcon as StarSolid,
  ArrowPathIcon,
  TrashIcon,
  EnvelopeOpenIcon,
  EnvelopeIcon,
  InboxIcon,
  TagIcon,
  UserGroupIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PaperClipIcon,
  ArrowUturnLeftIcon,
  FolderIcon
} from '@heroicons/react/24/outline'
import { StarIcon as StarOutline } from '@heroicons/react/24/outline'
import type { EmailMessage, EmailAttachment, EmailFolder } from '../services/types'
import { EmailAvatar } from './EmailAvatar'
import { AttachmentBadge } from './AttachmentBadge'
import ContextMenu from './ContextMenu'
import { useExtensionLocale, getCategoryInfo, formatListDate, formatFolderName } from '../services/i18n'
import { isWithinUnreadWindow, UNREAD_WINDOW_MS } from '../services/unread-today'
import { classifyEmailCategory, countByCategory, type EmailCategory } from '../services/email-categories'
import { EMAIL_PAGE_SIZE, getPageWindow } from '../services/paging'
import { isArchiveFolder, isDraftMessage, isSpamFolder, isStarredFolder, getMoveTargets } from '../services/folders'
import { formatSentRecipients, shouldShowRecipients } from '../services/recipients'
import { isKnownDraftMessage } from '../services/draft'
import { starredToneClass } from '../services/starred-tone'

interface EmailListProps {
  messages: EmailMessage[]
  loading: boolean
  error?: string | null
  activeFolder: string
  selectedEmailId: string | null
  searchQuery: string
  onSearchChange: (q: string) => void
  onRefresh: () => void
  onSelectEmail: (msg: EmailMessage) => void
  onPrefetchEmail?: (msg: EmailMessage) => void
  onToggleStarred: (id: string, currentStarred: boolean) => void
  onMarkRead: (id: string) => void
  onMarkUnread: (id: string) => void
  onDelete: (id: string) => void
  onBatchDelete: (ids: string[]) => void
  onBatchMarkRead: (ids: string[]) => void
  onRestore?: (id: string) => void
  onBatchRestore?: (ids: string[]) => void
  onOpenAttachment?: (msg: EmailMessage, attachment: EmailAttachment) => Promise<any> | void
  folders?: EmailFolder[]
  onReply?: (msg: EmailMessage) => void
  onMove?: (id: string, toFolder: string) => void
  onNotSpam?: (id: string) => void
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  totalCount?: number
  showCategoryTabs?: boolean
  unreadWindowMs?: number
  pageSize?: number
  page?: number
  onPageChange?: (page: number) => void
}

export const EmailList: React.FC<EmailListProps> = ({
  messages,
  loading,
  error,
  activeFolder,
  selectedEmailId,
  searchQuery,
  onSearchChange,
  onRefresh,
  onSelectEmail,
  onPrefetchEmail,
  onToggleStarred,
  onMarkRead,
  onMarkUnread,
  onDelete,
  onBatchDelete,
  onBatchMarkRead,
  onRestore,
  onBatchRestore,
  onOpenAttachment,
  folders = [],
  onReply,
  onMove,
  onNotSpam,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  totalCount,
  showCategoryTabs = true,
  unreadWindowMs = UNREAD_WINDOW_MS,
  pageSize = EMAIL_PAGE_SIZE,
  page = 0,
  onPageChange
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [activeCategory, setActiveCategory] = useState<'primary' | 'promotions' | 'social' | 'updates'>('primary')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; msg: EmailMessage } | null>(null)
  const [moveMenu, setMoveMenu] = useState<{ x: number; y: number; msg: EmailMessage } | null>(null)
  const [manualRefresh, setManualRefresh] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { locale, t } = useExtensionLocale()
  const activeFolderRole = folders.find(
    (folder) => folder.path.toLowerCase() === activeFolder.toLowerCase()
  )?.role
  const showingSpam = isSpamFolder(activeFolder, activeFolderRole)
  const showingStarred = isStarredFolder(activeFolder, activeFolderRole)
  const showingArchive = isArchiveFolder(activeFolder, activeFolderRole)
  const moveTargets = getMoveTargets(folders, activeFolder)

  // Reset category and unread filter when folder changes
  useEffect(() => {
    setActiveCategory('primary')
    setUnreadOnly(false)
  }, [activeFolder])

  // The refresh icon spins only for a manual click; background loads stay static.
  useEffect(() => {
    if (!loading && !loadingMore) setManualRefresh(false)
  }, [loading, loadingMore, manualRefresh])

  const goToPage = useCallback((next: number) => {
    onPageChange?.(Math.max(0, next))
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [onPageChange])

  const toggleSelectAll = () => {
    if (selectedIds.size === pageMessages.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pageMessages.map((m) => m.id)))
    }
  }

  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  // Gmail category for inbox tabs (shared rules with the background notifier)
  const classifyEmail = useCallback((msg: EmailMessage): EmailCategory => {
    return classifyEmailCategory({ from: msg.from, subject: msg.subject })
  }, [])

  // Filter by unreadOnly toggle + category (categories only apply in INBOX with tabs visible)
  const isInbox = activeFolder.toLowerCase() === 'inbox'
  const useCategories = isInbox && showCategoryTabs
  const filteredMessages = React.useMemo(() => {
    let msgs = unreadOnly ? messages.filter((m) => !m.read) : messages
    if (useCategories) {
      msgs = msgs.filter((m) => classifyEmail(m) === activeCategory)
    }
    return msgs
  }, [messages, unreadOnly, useCategories, activeCategory, classifyEmail])
  const categoryTotals = React.useMemo(() => countByCategory(messages), [messages])
  const pageWindow = getPageWindow(filteredMessages.length, page, pageSize)
  const pageMessages = React.useMemo(
    () => filteredMessages.slice(pageWindow.start, pageWindow.end),
    [filteredMessages, pageWindow.start, pageWindow.end]
  )
  const canPrev = page > 0
  const canNext =
    filteredMessages.length > pageWindow.end || hasMore || loadingMore

  // Fill short pages automatically and pre-fetch the next page in background,
  // ensuring that clicking ">" advances in 0ms instantly without loading delay.
  const autoFillCountRef = useRef(0)
  useEffect(() => {
    autoFillCountRef.current = 0
  }, [activeFolder, activeCategory, unreadOnly, page])

  useEffect(() => {
    if (!onLoadMore || loadingMore || loading || !hasMore) return

    const targetPrefetchCount = (page + 2) * pageSize
    const needsCurrentPage = pageMessages.length < pageSize
    const needsNextPagePrefetch = filteredMessages.length < targetPrefetchCount

    if (needsCurrentPage) {
      if (autoFillCountRef.current < 10) {
        autoFillCountRef.current += 1
        onLoadMore()
      }
    } else if (needsNextPagePrefetch) {
      // Gentle background pre-fetch for next page
      const timer = setTimeout(() => {
        if (!loadingMore && !loading && hasMore) {
          onLoadMore()
        }
      }, 400)
      return () => clearTimeout(timer)
    } else {
      autoFillCountRef.current = 0
    }
  }, [onLoadMore, pageMessages.length, filteredMessages.length, page, pageSize, hasMore, loadingMore, loading])

  const formatDate = (dateStr: string, timestamp: number) => formatListDate(timestamp, locale)

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-card overflow-hidden select-none">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-border bg-sidebar/30 gap-2 sm:gap-3">
        {/* Left: Checkbox & Batch Actions or Search */}
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="checkbox"
            checked={pageMessages.length > 0 && selectedIds.size === pageMessages.length}
            onChange={toggleSelectAll}
            className="rounded border-border cursor-pointer accent-accent"
            title={t('list.selectAll')}
          />

          <button
            type="button"
            onClick={() => {
              setManualRefresh(true)
              onRefresh()
            }}
            disabled={loading || loadingMore}
            className="p-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text active:scale-90 active:translate-y-0.5 active:bg-input/80 transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            title={t('list.refresh')}
          >
            <ArrowPathIcon className={`w-4 h-4 ${manualRefresh ? 'animate-spin text-accent' : ''}`} />
          </button>

          {selectedIds.size > 0 ? (
            <div className="flex items-center gap-1 pl-2 border-l border-border animate-fade-in text-xs">
                <span className="text-text-muted font-medium mr-1">{t('list.selected', { count: selectedIds.size })}</span>
              <button
                type="button"
                onClick={() => {
                  onBatchMarkRead(Array.from(selectedIds))
                  setSelectedIds(new Set())
                }}
                className="p-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text"
                title={t('list.markRead')}
              >
                <EnvelopeOpenIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onBatchDelete(Array.from(selectedIds))
                  setSelectedIds(new Set())
                }}
                className="p-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text"
                title={t('list.deleteSelected')}
              >
                <TrashIcon className="w-4 h-4" />
              </button>
              {showingArchive && onBatchRestore && (
                <button
                  type="button"
                  onClick={() => {
                    onBatchRestore(Array.from(selectedIds))
                    setSelectedIds(new Set())
                  }}
                  className="p-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text"
                  title={t('list.restore')}
                >
                  <ArrowUturnLeftIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setUnreadOnly(!unreadOnly)
                  goToPage(0)
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  unreadOnly
                    ? 'bg-accent/10 border-accent text-accent font-semibold'
                    : 'bg-input/40 border-border text-text-muted hover:text-text'
                }`}
              >
                {t('list.unreadOnly')}
              </button>
            </div>
          )}
        </div>

        {/* Right: Gmail pagination counter */}
        <div className="flex items-center gap-1.5 text-xs text-text-muted select-none pl-1 shrink-0">
            <span className="font-mono text-[11px] whitespace-nowrap">
              {filteredMessages.length === 0
                ? '0 de 0'
                : `${pageWindow.start + 1}–${pageWindow.start + pageMessages.length} de ${(totalCount && totalCount > filteredMessages.length ? totalCount : filteredMessages.length).toLocaleString('pt-BR')}`}
            </span>
            <div className="flex items-center">
              <button
                type="button"
                disabled={!canPrev}
                onClick={() => goToPage(page - 1)}
                className="p-1 rounded hover:bg-input text-text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title={t('list.prevPage')}
              >
                <ChevronLeftIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={!canNext}
                onClick={() => {
                  if (filteredMessages.length <= (page + 1) * pageSize && hasMore && onLoadMore) {
                    onLoadMore()
                  }
                  goToPage(page + 1)
                }}
                className="p-1 rounded hover:bg-input text-text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title={t('list.loadMore')}
              >
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

      {/* Main Email Content (below toolbar, with lateral separator from sidebar) */}
      <div className="flex-1 min-h-0 flex flex-col border-l border-border overflow-hidden">
        {/* Gmail Category Tabs: Principal, Promoções, Social, Atualizações (only in INBOX) */}
        {useCategories && (
        <div className="w-full flex items-stretch border-b border-border bg-transparent select-none overflow-x-auto no-scrollbar">
          {([
            { id: 'primary' as const, Icon: InboxIcon },
            { id: 'promotions' as const, Icon: TagIcon },
            { id: 'social' as const, Icon: UserGroupIcon },
            { id: 'updates' as const, Icon: InformationCircleIcon }
          ]).map(({ id, Icon }) => {
            const isActive = activeCategory === id
            const info = getCategoryInfo(id, locale)
            const unreadCount = messages.filter(
              (m) => classifyEmail(m) === id && !m.read && isWithinUnreadWindow(m.timestamp, Date.now(), unreadWindowMs)
            ).length
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setActiveCategory(id)
                  goToPage(0)
                }}
                title={info.description}
                className={`flex-1 min-w-fit max-w-[240px] h-11 sm:h-12 flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 text-xs font-semibold cursor-pointer relative transition-colors whitespace-nowrap shrink-0 sm:shrink ${
                  isActive
                    ? 'text-accent'
                    : 'text-text-muted hover:text-text hover:bg-input/20'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent stroke-2' : 'text-text-muted'}`} />
                <span className="truncate">{info.label}</span>
                <span className="text-[10px] tabular-nums opacity-60 shrink-0">· {categoryTotals[id]}</span>
                {unreadCount > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 tabular-nums leading-none ${
                      isActive ? 'bg-accent/15 text-accent' : 'bg-input text-text-muted'
                    }`}
                  >
                    {unreadCount > 999 ? '999+' : unreadCount}
                  </span>
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-accent rounded-t-sm" />
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="p-3 bg-input/40 border-b border-border text-xs text-text flex items-center justify-between">
            <span>{error}</span>
          <button type="button" onClick={onRefresh} className="text-accent underline font-medium">
            {t('list.retry')}
          </button>
        </div>
      )}

      {/* Message List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto divide-y divide-border/40">
        {loading && messages.length === 0 ? (
          <div className="p-8 flex flex-col items-center justify-center text-text-muted space-y-3">
            <ArrowPathIcon className="w-6 h-6 animate-spin text-accent" />
            <span className="text-xs">{t('list.loading')}</span>
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-text-muted space-y-2">
            <CheckCircleIcon className="w-10 h-10 opacity-30 text-accent" />
            <span className="text-sm font-medium text-text">
              {showingStarred ? t('list.emptyStarredTitle') : t('list.emptyTitle')}
            </span>
            <span className="text-xs text-text-muted">
              {showingStarred ? t('list.emptyStarredSubtitle') : t('list.emptySubtitle')}
            </span>
          </div>
        ) : (
          pageMessages.map((msg) => {
            const isSelected = selectedEmailId === msg.id
            const isChecked = selectedIds.has(msg.id)
            const showRecipients = shouldShowRecipients(activeFolder, activeFolderRole, msg, folders)

            return (
              <div
                key={msg.id}
                onClick={() => onSelectEmail(msg)}
                onMouseEnter={() => onPrefetchEmail?.(msg)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setContextMenu({ x: e.clientX, y: e.clientY, msg })
                }}
                className={`group flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 cursor-pointer text-xs transition-colors relative flex-nowrap min-w-0 overflow-hidden ${
                  isSelected
                    ? 'bg-accent/10 border-l-2 border-l-accent'
                    : isChecked
                      ? 'bg-input/60'
                      : msg.read
                        ? 'bg-card hover:bg-input/30 text-text-muted'
                        : 'bg-input/20 hover:bg-input/40 text-text font-semibold'
                }`}
              >
                {/* Left check & star */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onClick={(e) => toggleSelectOne(msg.id, e)}
                    onChange={() => {}}
                    className="rounded border-border cursor-pointer accent-accent"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleStarred(msg.id, msg.starred)
                    }}
                    className="p-0.5 rounded hover:bg-input text-text-muted hover:text-accent transition-colors"
                  >
                    {msg.starred ? (
                      <StarSolid className={`w-4 h-4 ${starredToneClass(msg.starred)}`} />
                    ) : (
                      <StarOutline className="w-4 h-4 opacity-40 hover:opacity-100" />
                    )}
                  </button>
                </div>

                {/* Sender or recipients (Gmail outgoing views show Para: without avatar) */}
                {showRecipients ? (
                  <div
                    className="w-28 sm:w-40 md:w-48 shrink-0 truncate"
                    title={(msg.to || []).map((r) => (r.name ? `${r.name} <${r.address}>` : r.address)).join(', ')}
                  >
                    <span className="truncate text-text-muted font-normal">
                      {t('list.sentTo')} {formatSentRecipients(msg.to) || msg.from.name || msg.from.address}
                    </span>
                  </div>
                ) : (
                <div className="w-28 sm:w-40 md:w-48 shrink-0 flex items-center gap-2 truncate">
                  <EmailAvatar name={msg.from.name} address={msg.from.address} size="sm" />
                  {(isDraftMessage(msg, folders) || isKnownDraftMessage(msg.accountId || '', msg.messageId)) && (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-error">
                      {t('list.draftBadge')}
                    </span>
                  )}
                  <span className={`truncate ${msg.read ? 'text-text-muted font-normal' : 'text-text font-bold'}`}>
                    {msg.from.name || msg.from.address}
                  </span>
                </div>
                )}

                {/* Subject, snippet & Attachment Chips — RIGOROSAMENTE NA MESMA LINHA */}
                <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden whitespace-nowrap">
                  <span className={`truncate shrink-0 max-w-[50%] sm:max-w-[60%] md:max-w-none ${msg.read ? 'text-text/80 font-normal' : 'text-text font-bold'}`}>
                    {msg.subject || t('list.noSubject')}
                  </span>
                  {msg.snippet && (
                    <span className="text-text-muted font-normal truncate hidden lg:inline min-w-0 flex-1">
                      — {msg.snippet}
                    </span>
                  )}

                  {/* Attachment chip (Gmail style) NA MESMA LINHA */}
                  {msg.attachments && msg.attachments.length > 0 && (() => {
                    const firstAtt = msg.attachments![0]
                    return (
                      <div className="shrink-0 flex items-center gap-1.5 overflow-hidden">
                        <AttachmentBadge
                          attachment={firstAtt}
                          variant="chip"
                          messageId={msg.id}
                          folder={msg.folder}
                          className="max-w-[120px] sm:max-w-[150px] py-0.5 px-2 text-[10px]"
                          onOpen={onOpenAttachment ? () => onOpenAttachment(msg, firstAtt) : undefined}
                        />
                        {msg.attachments!.length > 1 && (
                          <span
                            className="text-[10px] text-text-muted px-1.5 py-0.5 rounded-full border border-border/70 bg-input/40 select-none shrink-0"
                            title={t('list.attachmentsTitle', { count: msg.attachments!.length })}
                          >
                            +{msg.attachments!.length - 1}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </div>

                {/* Right: Clip, Date or Hover Actions */}
                <div className="shrink-0 flex items-center gap-2 ml-auto text-right whitespace-nowrap">
                  {/* Paperclip indicator */}
                  {(msg.hasAttachments || (msg.attachments && msg.attachments.length > 0)) && (
                    <PaperClipIcon className="w-3.5 h-3.5 text-text-muted shrink-0" title={t('list.hasAttachments')} />
                  )}

                  {/* Action buttons on hover */}
                  <div className="hidden group-hover:flex items-center gap-1">
                    {onReply && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onReply(msg)
                        }}
                        className="p-1 rounded hover:bg-input text-text-muted hover:text-text"
                        title={t('list.reply')}
                      >
                        <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleStarred(msg.id, msg.starred)
                      }}
                      className="p-1 rounded hover:bg-input text-text-muted hover:text-accent"
                      title={msg.starred ? t('list.unfavorite') : t('list.favorite')}
                    >
                      {msg.starred ? (
                        <StarSolid className={`w-3.5 h-3.5 ${starredToneClass(msg.starred)}`} />
                      ) : (
                        <StarOutline className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {onMove && moveTargets.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMoveMenu({ x: e.clientX, y: e.clientY, msg })
                        }}
                        className="p-1 rounded hover:bg-input text-text-muted hover:text-text"
                        title={t('list.move')}
                      >
                        <FolderIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {showingSpam && onNotSpam && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onNotSpam(msg.id)
                        }}
                        className="p-1 rounded hover:bg-input text-text-muted hover:text-accent"
                        title={t('list.notSpam')}
                      >
                        <CheckCircleIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {msg.read ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onMarkUnread(msg.id)
                        }}
                        className="p-1 rounded hover:bg-input text-text-muted hover:text-text"
                        title={t('list.markUnread')}
                      >
                        <EnvelopeIcon className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onMarkRead(msg.id)
                        }}
                        className="p-1 rounded hover:bg-input text-text-muted hover:text-text"
                title={t('list.markRead')}
                      >
                        <EnvelopeOpenIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(msg.id)
                      }}
                      className="p-1 rounded hover:bg-input text-text-muted hover:text-text"
                      title={t('list.delete')}
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Date badge */}
                  <span className="text-[11px] text-text-muted whitespace-nowrap font-mono group-hover:hidden sm:group-hover:inline">
                    {formatDate(msg.date, msg.timestamp)}
                  </span>
                </div>
              </div>
            )
          })
        )}

      </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              id: 'open',
              label: t('list.open'),
              onClick: () => onSelectEmail(contextMenu.msg)
            },
            ...(onReply
              ? [
                  {
                    id: 'reply',
                    label: t('list.reply'),
                    onClick: () => onReply(contextMenu.msg)
                  }
                ]
              : []),
            {
              id: 'star',
              label: contextMenu.msg.starred ? t('list.unfavorite') : t('list.favorite'),
              onClick: () => onToggleStarred(contextMenu.msg.id, contextMenu.msg.starred)
            },
            ...(showingSpam && onNotSpam
              ? [
                  {
                    id: 'not-spam',
                    label: t('list.notSpam'),
                    onClick: () => onNotSpam(contextMenu.msg.id)
                  }
                ]
              : []),
            contextMenu.msg.read
              ? {
                  id: 'unread',
                  label: t('list.markUnread'),
                  onClick: () => onMarkUnread(contextMenu.msg.id)
                }
              : {
                  id: 'read',
                  label: t('list.markRead'),
                  onClick: () => onMarkRead(contextMenu.msg.id)
                },
            {
              id: 'copy-subject',
              label: t('list.copySubject'),
              onClick: () => {
                try {
                  void navigator.clipboard?.writeText?.(contextMenu.msg.subject || t('list.noSubject'))
                } catch {}
              }
            },
            {
              id: 'copy-from',
              label: t('list.copyFrom'),
              onClick: () => {
                try {
                  const from = contextMenu.msg.from?.name
                    ? `${contextMenu.msg.from.name} <${contextMenu.msg.from.address}>`
                    : contextMenu.msg.from?.address || ''
                  void navigator.clipboard?.writeText?.(from)
                } catch {}
              }
            },
            {
              id: 'delete',
              label: t('list.delete'),
              danger: true,
              onClick: () => onDelete(contextMenu.msg.id)
            }
          ]}
        />
      )}

      {moveMenu && onMove && (
        <ContextMenu
          x={moveMenu.x}
          y={moveMenu.y}
          onClose={() => setMoveMenu(null)}
          items={moveTargets.map((folder) => ({
            id: `move-${folder.path}`,
            label: formatFolderName(folder.name, folder.role, locale),
            onClick: () => onMove(moveMenu.msg.id, folder.path)
          }))}
        />
      )}
    </div>
  )
}
