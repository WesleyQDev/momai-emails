// src/components/EmailList.tsx
// Message list view with infinite scroll and server-side search

import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  StarIcon as StarSolid,
  ArrowPathIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  EnvelopeOpenIcon,
  EnvelopeIcon,
  InboxIcon,
  TagIcon,
  UserGroupIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PaperClipIcon
} from '@heroicons/react/24/outline'
import { StarIcon as StarOutline } from '@heroicons/react/24/outline'
import type { EmailMessage, EmailAttachment } from '../services/types'
import { EmailAvatar } from './EmailAvatar'
import { AttachmentBadge } from './AttachmentBadge'
import ContextMenu from './ContextMenu'
import { CATEGORY_TRANSLATIONS } from '../services/i18n'

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
  onToggleStarred: (id: string, currentStarred: boolean) => void
  onMarkRead: (id: string) => void
  onMarkUnread: (id: string) => void
  onDelete: (id: string) => void
  onBatchDelete: (ids: string[]) => void
  onBatchMarkRead: (ids: string[]) => void
  onOpenAttachment?: (msg: EmailMessage, attachment: EmailAttachment) => Promise<any> | void
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  totalCount?: number
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
  onToggleStarred,
  onMarkRead,
  onMarkUnread,
  onDelete,
  onBatchDelete,
  onBatchMarkRead,
  onOpenAttachment,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  totalCount
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [activeCategory, setActiveCategory] = useState<'primary' | 'promotions' | 'social' | 'updates'>('primary')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; msg: EmailMessage } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Reset category when folder changes
  useEffect(() => {
    setActiveCategory('primary')
  }, [activeFolder])

  // Infinite scroll: IntersectionObserver on sentinel at bottom of list
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !onLoadMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          onLoadMore()
        }
      },
      { root: scrollRef.current, rootMargin: '200px', threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, loading, onLoadMore])

  const toggleSelectAll = () => {
    if (selectedIds.size === messages.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(messages.map((m) => m.id)))
    }
  }

  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  // Gmail-style category classification (heuristic, client-side)
  const classifyEmail = useCallback((msg: EmailMessage): 'primary' | 'promotions' | 'social' | 'updates' => {
    const from = (msg.from?.address || '').toLowerCase()
    const name = (msg.from?.name || '').toLowerCase()
    const subject = (msg.subject || '').toLowerCase()

    // Social: social networks, forums, communities
    const socialDomains = ['facebook', 'twitter', 'linkedin', 'instagram', 'tiktok', 'pinterest', 'reddit', 'discord', 'slack', 'whatsapp', 'telegram', 'snapchat', 'youtube', 'twitch', 'github', 'gitlab', 'meetup', 'quora', 'tumblr']
    if (socialDomains.some((d) => from.includes(d))) return 'social'
    const socialKeywords = ['friend request', 'solicitação de amizade', 'seguiu você', 'followed you', 'mentioned you', 'mencionou você', 'commented', 'comentou', 'liked', 'curtiu', 'shared', 'compartilhou', 'tagged', 'marcou', 'invite', 'convite', 'joined', 'entrou']
    if (socialKeywords.some((k) => subject.includes(k) || name.includes(k))) return 'social'

    // Promotions: marketing, deals, newsletters
    const promoDomains = ['newsletter', 'marketing', 'promo', 'noreply', 'no-reply', 'news@', 'offers', 'deals', 'shop', 'store', 'sale', 'mailer', 'campaign', 'mailchimp', 'sendgrid', 'hubspot', 'mailgun']
    if (promoDomains.some((d) => from.includes(d))) return 'promotions'
    const promoKeywords = ['unsubscribe', 'cancelar inscrição', 'descadastrar', 'oferta', 'offer', 'promoção', 'promotion', 'desconto', 'discount', 'cupom', 'coupon', 'sale', 'deal', 'newsletter', 'black friday', 'frete grátis', 'free shipping', 'compre', 'buy now', 'limited time', 'tempo limitado', 'exclusivo', 'exclusive']
    if (promoKeywords.some((k) => subject.includes(k))) return 'promotions'

    // Updates: notifications, transactional, automated
    const updateDomains = ['notify', 'notification', 'alert', 'update', 'security', 'account', 'billing', 'support', 'service', 'info@', 'system', 'admin', 'postmaster', 'mailer-daemon']
    if (updateDomains.some((d) => from.includes(d))) return 'updates'
    const updateKeywords = ['verificação', 'verification', 'confirmação', 'confirmation', 'senha', 'password', 'código', 'code', 'login', 'acesso', 'segurança', 'security', 'atualização', 'update', 'fatura', 'invoice', 'recibo', 'receipt', 'pagamento', 'payment', 'entrega', 'delivery', 'rastreio', 'tracking', 'pedido', 'order']
    if (updateKeywords.some((k) => subject.includes(k))) return 'updates'

    // Default: Primary (personal, direct correspondence)
    return 'primary'
  }, [])

  // Filter by unreadOnly toggle + category (only in INBOX)
  const isInbox = activeFolder.toLowerCase() === 'inbox'
  const filteredMessages = React.useMemo(() => {
    let msgs = unreadOnly ? messages.filter((m) => !m.read) : messages
    if (isInbox) {
      msgs = msgs.filter((m) => classifyEmail(m) === activeCategory)
    }
    return msgs
  }, [messages, unreadOnly, isInbox, activeCategory, classifyEmail])

  const formatDate = (dateStr: string, timestamp: number) => {
    if (!timestamp) return ''
    const msgDate = new Date(timestamp)
    const today = new Date()
    const isToday =
      msgDate.getDate() === today.getDate() &&
      msgDate.getMonth() === today.getMonth() &&
      msgDate.getFullYear() === today.getFullYear()

    if (isToday) {
      return msgDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }
    return msgDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-card overflow-hidden select-none">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-border bg-sidebar/30 gap-2 sm:gap-3">
        {/* Left: Checkbox & Batch Actions or Search */}
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="checkbox"
            checked={messages.length > 0 && selectedIds.size === messages.length}
            onChange={toggleSelectAll}
            className="rounded border-border cursor-pointer accent-accent"
            title="Selecionar todos"
          />

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text transition-colors"
            title="Atualizar pasta"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin text-accent' : ''}`} />
          </button>

          {selectedIds.size > 0 ? (
            <div className="flex items-center gap-1 pl-2 border-l border-border animate-fade-in text-xs">
              <span className="text-text-muted font-medium mr-1">{selectedIds.size} selecionado(s)</span>
              <button
                type="button"
                onClick={() => {
                  onBatchMarkRead(Array.from(selectedIds))
                  setSelectedIds(new Set())
                }}
                className="p-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text"
                title="Marcar como lido"
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
                title="Excluir selecionados"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setUnreadOnly(!unreadOnly)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  unreadOnly
                    ? 'bg-accent/10 border-accent text-accent font-semibold'
                    : 'bg-input/40 border-border text-text-muted hover:text-text'
                }`}
              >
                Não Lidos
              </button>
            </div>
          )}
        </div>

        {/* Right: Gmail pagination counter */}
        <div className="flex items-center gap-1.5 text-xs text-text-muted select-none pl-1 shrink-0">
            <span className="font-mono text-[11px] whitespace-nowrap">
              {messages.length === 0
                ? '0 de 0'
                : `1–${messages.length} de ${(totalCount && totalCount > messages.length ? totalCount : messages.length).toLocaleString('pt-BR')}`}
            </span>
            <div className="flex items-center">
              <button
                type="button"
                disabled={messages.length <= 50}
                onClick={() => {
                  if (scrollRef.current) scrollRef.current.scrollTop = 0
                }}
                className="p-1 rounded hover:bg-input text-text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Voltar ao início"
              >
                <ChevronLeftIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={!hasMore || loadingMore}
                onClick={() => {
                  if (onLoadMore && hasMore && !loadingMore) onLoadMore()
                }}
                className="p-1 rounded hover:bg-input text-text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Carregar mais 50 e-mails"
              >
                <ChevronRightIcon className={`w-3.5 h-3.5 ${loadingMore ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

      {/* Gmail Category Tabs: Principal, Promoções, Social, Atualizações (only in INBOX) */}
      {isInbox && (
        <div className="w-full flex items-stretch border-b border-border bg-transparent select-none overflow-x-auto no-scrollbar">
          {([
            { id: 'primary' as const, Icon: InboxIcon },
            { id: 'promotions' as const, Icon: TagIcon },
            { id: 'social' as const, Icon: UserGroupIcon },
            { id: 'updates' as const, Icon: InformationCircleIcon }
          ]).map(({ id, Icon }) => {
            const isActive = activeCategory === id
            const info = CATEGORY_TRANSLATIONS[id] || { label: id, description: '' }
            const unreadCount = messages.filter((m) => classifyEmail(m) === id && !m.read).length
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveCategory(id)}
                title={info.description}
                className={`flex-1 min-w-fit max-w-[240px] h-11 sm:h-12 flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 text-xs font-semibold cursor-pointer relative transition-colors whitespace-nowrap shrink-0 sm:shrink ${
                  isActive
                    ? 'text-accent'
                    : 'text-text-muted hover:text-text hover:bg-input/20'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent stroke-2' : 'text-text-muted'}`} />
                <span className="truncate">{info.label}</span>
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
            Tentar novamente
          </button>
        </div>
      )}

      {/* Message List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto divide-y divide-border/40">
        {loading && messages.length === 0 ? (
          <div className="p-8 flex flex-col items-center justify-center text-text-muted space-y-3">
            <ArrowPathIcon className="w-6 h-6 animate-spin text-accent" />
            <span className="text-xs">Carregando mensagens do servidor...</span>
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-text-muted space-y-2">
            <CheckCircleIcon className="w-10 h-10 opacity-30 text-accent" />
            <span className="text-sm font-medium text-text">Nenhuma mensagem nesta pasta</span>
            <span className="text-xs text-text-muted">Sua caixa de entrada está limpa e atualizada.</span>
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const isSelected = selectedEmailId === msg.id
            const isChecked = selectedIds.has(msg.id)

            return (
              <div
                key={msg.id}
                onClick={() => onSelectEmail(msg)}
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
                      <StarSolid className="w-4 h-4 text-accent" />
                    ) : (
                      <StarOutline className="w-4 h-4 opacity-40 hover:opacity-100" />
                    )}
                  </button>
                </div>

                {/* Sender (responsive width for windowed mode) */}
                <div className="w-28 sm:w-40 md:w-48 shrink-0 flex items-center gap-2 truncate">
                  <EmailAvatar name={msg.from.name} address={msg.from.address} size="sm" />
                  <span className={`truncate ${msg.read ? 'text-text-muted font-normal' : 'text-text font-bold'}`}>
                    {msg.from.name || msg.from.address}
                  </span>
                </div>

                {/* Subject, snippet & Attachment Chips — RIGOROSAMENTE NA MESMA LINHA */}
                <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden whitespace-nowrap">
                  <span className={`truncate shrink-0 max-w-[50%] sm:max-w-[60%] md:max-w-none ${msg.read ? 'text-text/80 font-normal' : 'text-text font-bold'}`}>
                    {msg.subject || '(Sem assunto)'}
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
                            title={`${msg.attachments!.length} anexos`}
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
                    <PaperClipIcon className="w-3.5 h-3.5 text-text-muted shrink-0" title="Contém anexos" />
                  )}

                  {/* Action buttons on hover */}
                  <div className="hidden group-hover:flex items-center gap-1">
                    {msg.read ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onMarkUnread(msg.id)
                        }}
                        className="p-1 rounded hover:bg-input text-text-muted hover:text-text"
                        title="Marcar como não lido"
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
                        title="Marcar como lido"
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
                      title="Excluir"
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

        {/* Infinite scroll sentinel + loading indicator */}
        {hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-4 text-xs text-text-muted">
            {loadingMore ? (
              <div className="flex items-center gap-2">
                <ArrowPathIcon className="w-4 h-4 animate-spin text-accent" />
                <span>Carregando mais e-mails...</span>
              </div>
            ) : (
              <span className="opacity-50">Rolar para carregar mais</span>
            )}
          </div>
        )}

        {!hasMore && messages.length > 0 && !loading && (
          <div className="flex items-center justify-center py-3 text-[11px] text-text-muted opacity-50">
            Todos os e-mails foram carregados
          </div>
        )}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              id: 'open',
              label: 'Abrir',
              onClick: () => onSelectEmail(contextMenu.msg)
            },
            {
              id: 'star',
              label: contextMenu.msg.starred ? 'Desfavoritar' : 'Favoritar',
              onClick: () => onToggleStarred(contextMenu.msg.id, contextMenu.msg.starred)
            },
            contextMenu.msg.read
              ? {
                  id: 'unread',
                  label: 'Marcar como não lido',
                  onClick: () => onMarkUnread(contextMenu.msg.id)
                }
              : {
                  id: 'read',
                  label: 'Marcar como lido',
                  onClick: () => onMarkRead(contextMenu.msg.id)
                },
            {
              id: 'copy-subject',
              label: 'Copiar assunto',
              onClick: () => {
                try {
                  void navigator.clipboard?.writeText?.(contextMenu.msg.subject || '(Sem assunto)')
                } catch {}
              }
            },
            {
              id: 'copy-from',
              label: 'Copiar remetente',
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
              label: 'Excluir',
              danger: true,
              onClick: () => onDelete(contextMenu.msg.id)
            }
          ]}
        />
      )}
    </div>
  )
}
