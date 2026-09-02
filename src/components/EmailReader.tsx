// src/components/EmailReader.tsx
// Reading pane with sanitized HTML (DOMPurify), attachments, action toolbar, and quick reply

import React, { useState } from 'react'
import DOMPurify from 'dompurify'
import {
  ArrowLeftIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  TrashIcon,
  EnvelopeIcon,
  PaperClipIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  PaperAirplaneIcon
} from '@heroicons/react/24/outline'
import { EmailAvatar } from './EmailAvatar'
import type { EmailMessage } from '../services/types'

interface EmailReaderProps {
  email: EmailMessage | null
  loading: boolean
  onBack: () => void
  onReply: (email: EmailMessage, replyAll?: boolean) => void
  onForward: (email: EmailMessage) => void
  onDelete: (id: string) => void
  onMarkUnread: (id: string) => void
  onQuickSendReply: (body: string) => Promise<boolean>
}

export const EmailReader: React.FC<EmailReaderProps> = ({
  email,
  loading,
  onBack,
  onReply,
  onForward,
  onDelete,
  onMarkUnread,
  onQuickSendReply
}) => {
  const [viewHtml, setViewHtml] = useState(true)
  const [quickReplyText, setQuickReplyText] = useState('')
  const [sendingQuickReply, setSendingQuickReply] = useState(false)

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-card text-text-muted p-8 space-y-3">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <span className="text-xs">Carregando conteúdo do e-mail...</span>
      </div>
    )
  }

  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center bg-card text-text-muted p-8 text-xs">
        Selecione um e-mail para ler.
      </div>
    )
  }

  const sanitizedHtml = email.html
    ? DOMPurify.sanitize(email.html, {
        ADD_ATTR: ['target'],
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed']
      })
    : ''

  const handleQuickReply = async () => {
    if (!quickReplyText.trim()) return
    setSendingQuickReply(true)
    try {
      const ok = await onQuickSendReply(quickReplyText)
      if (ok) {
        setQuickReplyText('')
      }
    } finally {
      setSendingQuickReply(false)
    }
  }

  const formatFullDate = (timestamp: number) => {
    if (!timestamp) return ''
    return new Date(timestamp).toLocaleString('pt-BR', {
      weekday: 'short',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const initial = (email.from.name || email.from.address || '?').charAt(0).toUpperCase()

  return (
    <div className="flex-1 flex flex-col bg-card overflow-hidden">
      {/* Action Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-sidebar/30">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text transition-colors mr-2"
            title="Voltar"
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onReply(email, false)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text text-xs font-medium transition-colors"
            title="Responder"
          >
            <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
            <span>Responder</span>
          </button>

          <button
            type="button"
            onClick={() => onForward(email)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text text-xs font-medium transition-colors"
            title="Encaminhar"
          >
            <ArrowUturnRightIcon className="w-3.5 h-3.5" />
            <span>Encaminhar</span>
          </button>

          <button
            type="button"
            onClick={() => onMarkUnread(email.id)}
            className="p-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text transition-colors"
            title="Marcar como não lido"
          >
            <EnvelopeIcon className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onDelete(email.id)}
            className="p-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text transition-colors"
            title="Excluir mensagem"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Format toggle button */}
        {email.html && (
          <button
            type="button"
            onClick={() => setViewHtml(!viewHtml)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-input/40 hover:bg-input border border-border text-xs text-text-muted hover:text-text transition-colors"
            title="Alternar formato de visualização"
          >
            {viewHtml ? (
              <>
                <DocumentTextIcon className="w-3.5 h-3.5" />
                <span>Ver Texto</span>
              </>
            ) : (
              <>
                <CodeBracketIcon className="w-3.5 h-3.5" />
                <span>Ver Formatado</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Main Email View */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Subject Header */}
        <div className="space-y-3">
          <h1 className="text-xl font-bold text-text leading-tight">{email.subject || '(Sem assunto)'}</h1>

          {/* Sender & Recipient Card */}
          <div className="flex items-start justify-between gap-4 pt-1">
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <EmailAvatar
                name={email.from.name}
                address={email.from.address}
                size="lg"
                className="w-10 h-10 shadow-xs"
              />

              {/* Names & Addresses */}
              <div className="space-y-0.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-text text-sm">{email.from.name || email.from.address}</span>
                  <span className="text-text-muted text-[11px]">&lt;{email.from.address}&gt;</span>
                </div>
                <div className="text-text-muted text-[11px]">
                  <span>para: {email.to.map((t) => t.name || t.address).join(', ')}</span>
                  {email.cc && email.cc.length > 0 && (
                    <span className="ml-2">cc: {email.cc.map((c) => c.name || c.address).join(', ')}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Date */}
            <span className="text-[11px] text-text-muted font-mono whitespace-nowrap shrink-0">
              {formatFullDate(email.timestamp)}
            </span>
          </div>
        </div>

        <div className="border-t border-border/50" />

        {/* Email Body Content */}
        <div className="text-xs text-text leading-relaxed">
          {viewHtml && sanitizedHtml ? (
            <div
              className="email-content prose prose-invert max-w-none break-words"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : (
            <pre className="font-sans whitespace-pre-wrap leading-relaxed text-text/90">
              {email.text || email.snippet || '(Mensagem vazia)'}
            </pre>
          )}
        </div>

        {/* Attachments Section */}
        {email.attachments && email.attachments.length > 0 && (
          <div className="space-y-2 pt-4 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
              <PaperClipIcon className="w-4 h-4 text-accent" />
              <span>Anexos ({email.attachments.length})</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {email.attachments.map((att, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border bg-input/30 text-xs text-text"
                >
                  <DocumentTextIcon className="w-5 h-5 text-text-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{att.filename}</span>
                    <span className="text-[10px] text-text-muted">
                      {(att.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Reply Box */}
        <div className="pt-6 border-t border-border space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-text">
            <ArrowUturnLeftIcon className="w-4 h-4 text-accent" />
            <span>Resposta Rápida</span>
          </div>

          <textarea
            rows={3}
            value={quickReplyText}
            onChange={(e) => setQuickReplyText(e.target.value)}
            placeholder={`Responder para ${email.from.name || email.from.address}...`}
            className="w-full p-3 rounded-lg bg-input border border-border text-xs text-text placeholder:text-text-muted focus:outline-hidden focus:border-accent resize-y"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleQuickReply}
              disabled={sendingQuickReply || !quickReplyText.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-bg font-semibold text-xs hover:opacity-90 transition-opacity disabled:opacity-50 shadow-sm"
            >
              {sendingQuickReply ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <PaperAirplaneIcon className="w-3.5 h-3.5" />
                  <span>Enviar Resposta</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
