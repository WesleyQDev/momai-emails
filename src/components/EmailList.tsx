// src/components/EmailList.tsx
// Message list view following Gmail layout and interactions

import React, { useState } from 'react'
import {
  StarIcon as StarSolid,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  EnvelopeOpenIcon,
  EnvelopeIcon,
  CheckCircleIcon
} from '@heroicons/react/24/solid'
import { StarIcon as StarOutline } from '@heroicons/react/24/outline'
import type { EmailMessage } from '../services/types'

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
  onBatchMarkRead
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [unreadOnly, setUnreadOnly] = useState(false)

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

  const filteredMessages = messages.filter((m) => {
    if (unreadOnly && m.read) return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    const sender = (m.from.name || m.from.address).toLowerCase()
    const subject = m.subject.toLowerCase()
    const snippet = m.snippet.toLowerCase()
    return sender.includes(q) || subject.includes(q) || snippet.includes(q)
  })

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
    <div className="flex-1 flex flex-col bg-card overflow-hidden select-none">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-sidebar/30 gap-3">
        {/* Left: Checkbox & Batch Actions or Search */}
        <div className="flex items-center gap-2">
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

        {/* Right: Search box */}
        <div className="flex-1 max-w-sm relative">
          <MagnifyingGlassIcon className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Pesquisar e-mails..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-input border border-border text-xs text-text placeholder:text-text-muted focus:outline-hidden focus:border-accent"
          />
        </div>
      </div>

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
      <div className="flex-1 overflow-y-auto divide-y divide-border/40">
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
                className={`group flex items-center gap-3 px-4 py-2.5 cursor-pointer text-xs transition-colors relative ${
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
                <div className="flex items-center gap-2 shrink-0">
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

                {/* Sender */}
                <div className="w-40 shrink-0 truncate">
                  <span className={msg.read ? 'text-text-muted font-normal' : 'text-text font-bold'}>
                    {msg.from.name || msg.from.address}
                  </span>
                </div>

                {/* Subject & snippet */}
                <div className="flex-1 min-w-0 flex items-center gap-2 truncate">
                  <span className={`truncate ${msg.read ? 'text-text/80 font-normal' : 'text-text font-bold'}`}>
                    {msg.subject || '(Sem assunto)'}
                  </span>
                  {msg.snippet && (
                    <span className="text-text-muted font-normal truncate hidden sm:inline">
                      — {msg.snippet}
                    </span>
                  )}
                </div>

                {/* Right: Date or Hover Actions */}
                <div className="shrink-0 flex items-center gap-2">
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
      </div>
    </div>
  )
}
