// src/components/EmailComposer.tsx
// Floating compose window following Gmail UX style with recipient autocomplete

import React, { useState, useEffect, useRef } from 'react'
import {
  XMarkIcon,
  MinusIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  PaperAirplaneIcon,
  TrashIcon,
  UserIcon
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

interface RecipientItem {
  email: string
  name?: string
  lastUsed: number
}

const RECIPIENTS_KEY = 'momai_emails_recent_recipients_v1'

function getRecentRecipients(): RecipientItem[] {
  try {
    const raw = localStorage.getItem(RECIPIENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveRecipient(email: string, name?: string): RecipientItem[] {
  try {
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !cleanEmail.includes('@')) return getRecentRecipients()
    const existing = getRecentRecipients()
    const filtered = existing.filter((r) => r.email.toLowerCase() !== cleanEmail)
    const updated = [{ email: cleanEmail, name: name?.trim(), lastUsed: Date.now() }, ...filtered].slice(0, 20)
    localStorage.setItem(RECIPIENTS_KEY, JSON.stringify(updated))
    return updated
  } catch {
    return []
  }
}

function deleteRecipient(email: string): RecipientItem[] {
  try {
    const existing = getRecentRecipients()
    const updated = existing.filter((r) => r.email.toLowerCase() !== email.toLowerCase())
    localStorage.setItem(RECIPIENTS_KEY, JSON.stringify(updated))
    return updated
  } catch {
    return []
  }
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

  // Autocomplete state
  const [recentRecipients, setRecentRecipients] = useState<RecipientItem[]>([])
  const [showToAutofill, setShowToAutofill] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; email: string } | null>(null)
  const toInputRef = useRef<HTMLInputElement>(null)
  const toAutofillRef = useRef<HTMLDivElement>(null)

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
      setRecentRecipients(getRecentRecipients())
    }
  }, [isOpen, initialData, activeAccountId, accounts])

  // Close autofill on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        toAutofillRef.current &&
        !toAutofillRef.current.contains(e.target as Node) &&
        toInputRef.current &&
        !toInputRef.current.contains(e.target as Node)
      ) {
        setShowToAutofill(false)
      }
      setContextMenu(null)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

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
        // Save to recent recipients
        saveRecipient(to.trim())
        onClose()
      }
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado ao enviar e-mail.')
    } finally {
      setLoading(false)
    }
  }

  const filteredRecipients = recentRecipients.filter((r) => {
    if (!to.trim()) return true
    const q = to.toLowerCase()
    return r.email.toLowerCase().includes(q) || (r.name && r.name.toLowerCase().includes(q))
  })

  return (
    <div
      className={`fixed z-50 bg-card border border-border shadow-glass-lg rounded-t-xl overflow-hidden flex flex-col transition-all duration-200 animate-slide-up ${
        isMinimized
          ? 'bottom-0 right-8 w-72 h-11'
          : isMaximized
            ? 'inset-4 rounded-xl'
            : 'bottom-0 right-8 w-[580px] h-[520px]'
      }`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-sidebar/90 border-b border-border select-none">
        <span className="text-xs font-semibold text-text truncate">
          {subject.trim() ? subject : 'Nova Mensagem'}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 rounded hover:bg-input text-text-muted hover:text-text transition-colors"
            title={isMinimized ? 'Restaurar' : 'Minimizar'}
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

          {/* To Field with Cc/Bcc buttons and Autocomplete */}
          <div className="flex items-center px-4 py-2 border-b border-border/40 gap-2 relative">
            <span className="text-text-muted font-medium w-12 shrink-0">Para:</span>
            <input
              ref={toInputRef}
              type="email"
              required
              autoComplete="off"
              value={to}
              onFocus={() => setShowToAutofill(true)}
              onChange={(e) => {
                setTo(e.target.value)
                setShowToAutofill(true)
              }}
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

            {/* Recipient Autocomplete Dropdown */}
            {showToAutofill && filteredRecipients.length > 0 && (
              <div
                ref={toAutofillRef}
                className="absolute left-16 right-4 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-glass-lg overflow-hidden py-1 max-h-48 overflow-y-auto animate-fade-in"
              >
                <div className="px-3 py-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border/40 flex justify-between items-center">
                  <span>Destinatários frequentes</span>
                  <span className="text-[9px] opacity-70">Clique direito para excluir</span>
                </div>
                {filteredRecipients.map((item) => (
                  <div
                    key={item.email}
                    onClick={() => {
                      setTo(item.email)
                      setShowToAutofill(false)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setContextMenu({ visible: true, x: e.clientX, y: e.clientY, email: item.email })
                    }}
                    className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-input transition-colors group select-none text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-5 h-5 rounded-full bg-sidebar flex items-center justify-center shrink-0 border border-border/60">
                        <UserIcon className="w-3 h-3 text-text-muted" />
                      </div>
                      <div className="truncate">
                        <span className="font-medium text-text">{item.email}</span>
                        {item.name && (
                          <span className="text-[10px] text-text-muted ml-1.5 font-normal">({item.name})</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        const updated = deleteRecipient(item.email)
                        setRecentRecipients(updated)
                      }}
                      title="Excluir do preenchimento automático"
                      className="p-1 rounded text-text-muted hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
              rows={12}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escreva sua mensagem aqui..."
              className="w-full h-full bg-transparent border-none text-text placeholder:text-text-muted focus:outline-hidden resize-none text-xs leading-relaxed font-sans"
            />
          </div>

          {/* Bottom Toolbar & Send Button */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-sidebar/40">
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={loading || !to.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl font-semibold text-xs bg-accent text-bg shadow-glass-sm hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all"
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <PaperAirplaneIcon className="w-3.5 h-3.5 stroke-2" />
                    <span>Enviar</span>
                  </>
                )}
              </button>

              <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer hover:text-text select-none">
                <input
                  type="checkbox"
                  checked={isHtml}
                  onChange={(e) => setIsHtml(e.target.checked)}
                  className="rounded border-border accent-accent"
                />
                <span>Enviar como HTML</span>
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

      {/* Right-click Context Menu for Recipient Deletion */}
      {contextMenu && contextMenu.visible && (
        <div
          className="fixed z-60 bg-card border border-border rounded-xl shadow-glass-lg py-1 px-1 text-xs text-text animate-fade-in"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              const updated = deleteRecipient(contextMenu.email)
              setRecentRecipients(updated)
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-accent hover:bg-input text-left font-medium transition-colors"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            <span>Excluir do preenchimento automático</span>
          </button>
        </div>
      )}
    </div>
  )
}
