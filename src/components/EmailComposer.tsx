// src/components/EmailComposer.tsx
// Floating compose window following Gmail UX style

import React, { useState, useEffect } from 'react'
import {
  XMarkIcon,
  MinusIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  PaperAirplaneIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import type { PublicEmailAccount, SendEmailPayload } from '../services/types'

interface EmailComposerProps {
  isOpen: boolean
  accounts: PublicEmailAccount[]
  activeAccountId: string | null
  initialData?: Partial<SendEmailPayload>
  onClose: () => void
  onSend: (payload: SendEmailPayload) => Promise<{ ok: boolean; error?: string }>
}

export const EmailComposer: React.FC<EmailComposerProps> = ({
  isOpen,
  accounts,
  activeAccountId,
  initialData,
  onClose,
  onSend
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [isHtml, setIsHtml] = useState(false)

  const [isMinimized, setIsMinimized] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setSelectedAccountId(initialData?.accountId || activeAccountId || accounts[0]?.id || '')
      setTo(initialData?.to || '')
      setCc(initialData?.cc || '')
      setBcc(initialData?.bcc || '')
      setShowCc(Boolean(initialData?.cc))
      setShowBcc(Boolean(initialData?.bcc))
      setSubject(initialData?.subject || '')
      setBody(initialData?.body || '')
      setIsHtml(Boolean(initialData?.isHtml))
      setError(null)
      setIsMinimized(false)
    }
  }, [isOpen, initialData, activeAccountId, accounts])

  if (!isOpen) return null

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!to.trim()) {
      setError('Por favor, informe ao menos um destinatário.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await onSend({
        accountId: selectedAccountId,
        to: to.trim(),
        subject: subject.trim() || '(Sem assunto)',
        body,
        isHtml,
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        inReplyTo: initialData?.inReplyTo,
        references: initialData?.references
      })

      if (!res.ok) {
        setError(res.error || 'Falha ao enviar mensagem.')
      } else {
        onClose()
      }
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado ao enviar e-mail.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={`fixed z-50 transition-all duration-200 ${
        isMaximized
          ? 'inset-4 flex flex-col'
          : isMinimized
            ? 'bottom-0 right-8 w-80 h-10'
            : 'bottom-0 right-8 w-[580px] h-[520px] max-h-[90vh]'
      } bg-card border border-border rounded-t-xl shadow-glass-md overflow-hidden flex flex-col animate-slide-in-up`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-sidebar/80 select-none">
        <span className="text-xs font-semibold text-text truncate max-w-[280px]">
          {subject ? subject : 'Nova Mensagem'}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 rounded hover:bg-input text-text-muted hover:text-text transition-colors"
            title={isMinimized ? 'Expandir' : 'Minimizar'}
          >
            <MinusIcon className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 rounded hover:bg-input text-text-muted hover:text-text transition-colors"
            title={isMaximized ? 'Restaurar' : 'Maximizar'}
          >
            {isMaximized ? (
              <ArrowsPointingInIcon className="w-3.5 h-3.5" />
            ) : (
              <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-input text-text-muted hover:text-text transition-colors"
            title="Fechar"
          >
            <XMarkIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body (hidden when minimized) */}
      {!isMinimized && (
        <form onSubmit={handleSend} className="flex-1 flex flex-col overflow-hidden text-xs">
          {/* Account Selector (From) */}
          <div className="flex items-center px-4 py-2 border-b border-border/40 gap-2 bg-input/10">
            <span className="text-text-muted font-medium w-12 shrink-0">De:</span>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="flex-1 bg-transparent border-none text-text text-xs focus:outline-hidden cursor-pointer"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id} className="bg-card text-text">
                  {acc.name ? `${acc.name} <${acc.email}>` : acc.email}
                </option>
              ))}
            </select>
          </div>

          {/* To Field with Cc/Bcc buttons */}
          <div className="flex items-center px-4 py-2 border-b border-border/40 gap-2">
            <span className="text-text-muted font-medium w-12 shrink-0">Para:</span>
            <input
              type="text"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="destinatario@email.com"
              className="flex-1 bg-transparent border-none text-text placeholder:text-text-muted focus:outline-hidden text-xs"
            />
            <div className="flex items-center gap-1 text-[11px] text-text-muted">
              {!showCc && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="hover:text-text hover:underline"
                >
                  Cc
                </button>
              )}
              {!showBcc && (
                <button
                  type="button"
                  onClick={() => setShowBcc(true)}
                  className="hover:text-text hover:underline ml-1"
                >
                  Cco
                </button>
              )}
            </div>
          </div>

          {/* Optional Cc Field */}
          {showCc && (
            <div className="flex items-center px-4 py-2 border-b border-border/40 gap-2 animate-fade-in">
              <span className="text-text-muted font-medium w-12 shrink-0">Cc:</span>
              <input
                type="text"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="copia@email.com"
                className="flex-1 bg-transparent border-none text-text placeholder:text-text-muted focus:outline-hidden text-xs"
              />
            </div>
          )}

          {/* Optional Bcc Field */}
          {showBcc && (
            <div className="flex items-center px-4 py-2 border-b border-border/40 gap-2 animate-fade-in">
              <span className="text-text-muted font-medium w-12 shrink-0">Cco:</span>
              <input
                type="text"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="copia-oculta@email.com"
                className="flex-1 bg-transparent border-none text-text placeholder:text-text-muted focus:outline-hidden text-xs"
              />
            </div>
          )}

          {/* Subject Field */}
          <div className="flex items-center px-4 py-2 border-b border-border/40 gap-2">
            <span className="text-text-muted font-medium w-12 shrink-0">Assunto:</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Assunto da mensagem"
              className="flex-1 bg-transparent border-none text-text placeholder:text-text-muted focus:outline-hidden text-xs font-medium"
            />
          </div>

          {/* Error notice */}
          {error && (
            <div className="px-4 py-2 bg-input/40 border-b border-border text-xs text-text">
              {error}
            </div>
          )}

          {/* Body Editor */}
          <div className="flex-1 p-4 overflow-y-auto">
            <textarea
              required
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escreva sua mensagem aqui..."
              className="w-full h-full bg-transparent border-none text-text placeholder:text-text-muted focus:outline-hidden text-xs resize-none leading-relaxed"
            />
          </div>

          {/* Bottom Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-sidebar/40">
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-xs bg-accent text-bg hover:opacity-90 transition-opacity disabled:opacity-50 shadow-sm"
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <PaperAirplaneIcon className="w-4 h-4" />
                    <span>Enviar</span>
                  </>
                )}
              </button>

              <label className="flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={isHtml}
                  onChange={(e) => setIsHtml(e.target.checked)}
                  className="rounded border-border accent-accent"
                />
                <span>Formato HTML</span>
              </label>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-input text-text-muted hover:text-text transition-colors"
              title="Descartar rascunho"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
