import React, { useState, useMemo } from 'react'
import {
  PaperAirplaneIcon,
  CheckCircleIcon,
  DocumentDuplicateIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'

interface ShareProps {
  payload: {
    title?: string
    text?: string
    url?: string
    files?: Array<{ name: string; path?: string; dataUrl?: string; mimeType?: string }>
    [key: string]: any
  }
  onClose: () => void
  onBack: () => void
  onSuccess?: () => void
}

export default function EmailShareCard({
  payload,
  onClose,
  onBack,
  onSuccess
}: ShareProps): React.JSX.Element {
  const initialSubject = payload.title || 'Compartilhamento via MomAI'

  const initialBody = useMemo(() => {
    const parts: string[] = []
    if (payload.text) parts.push(payload.text)
    if (payload.url) parts.push(payload.url)
    return parts.join('\n\n')
  }, [payload])

  const [to, setTo] = useState('')
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState(initialBody)
  const [sending, setSending] = useState(false)
  const [sentSuccess, setSentSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSend = async () => {
    if (!to.trim()) {
      setErrorMessage('Informe o e-mail do destinatário.')
      return
    }
    if (!subject.trim()) {
      setErrorMessage('Informe o assunto do e-mail.')
      return
    }

    setSending(true)
    setErrorMessage(null)

    try {
      const base =
        (typeof window !== 'undefined' &&
          ((window as any).api?.getApiBaseUrl?.() ||
            (window as any).momaiAPI?.getApiBaseUrl?.())) ||
        'http://127.0.0.1:39741'

      const args: Record<string, any> = {
        to: to.trim(),
        subject: subject.trim(),
        body: body.trim()
      }

      const res = await fetch(`${base}/extensions/momai-emails/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': (window as any)?.api?.getSessionToken?.() || ''
        },
        body: JSON.stringify({
          toolName: 'send_email',
          args
        })
      })

      const resData = await res.json().catch(() => null)
      if (res.ok && resData?.ok !== false) {
        setSentSuccess(true)
        setTimeout(() => {
          onSuccess?.()
        }, 1200)
      } else {
        setErrorMessage(resData?.error || 'Não foi possível enviar o e-mail.')
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro ao comunicar com o servidor de e-mail.')
    } finally {
      setSending(false)
    }
  }

  if (sentSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center space-y-3 animate-zoom-in">
        <div className="w-14 h-14 rounded-full bg-success/15 text-success flex items-center justify-center">
          <CheckCircleIcon className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-text">E-mail Enviado!</h3>
        <p className="text-xs text-text-muted">A mensagem foi enviada com sucesso para {to}.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Destinatário */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-muted">Para:</label>
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="destinatario@exemplo.com"
          className="w-full px-3 py-1.5 bg-input border border-border rounded-lg text-xs text-text placeholder:text-text-muted/60 focus:outline-none focus:border-border-hover"
        />
      </div>

      {/* Assunto */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-muted">Assunto:</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Assunto da mensagem..."
          className="w-full px-3 py-1.5 bg-input border border-border rounded-lg text-xs text-text placeholder:text-text-muted/60 focus:outline-none focus:border-border-hover font-medium"
        />
      </div>

      {/* Mensagem / Corpo */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-muted">Mensagem:</label>
        <textarea
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escreva a mensagem..."
          className="w-full p-2.5 bg-input border border-border rounded-lg text-xs text-text placeholder:text-text-muted/60 focus:outline-none focus:border-border-hover resize-none leading-relaxed"
        />
      </div>

      {/* Anexos */}
      {payload.files && payload.files.length > 0 && (
        <div className="p-2 bg-sidebar border border-border rounded-lg flex items-center gap-2">
          <DocumentDuplicateIcon className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="text-xs text-text truncate">
            {payload.files.length === 1
              ? payload.files[0].name
              : `${payload.files.length} arquivos anexados`}
          </span>
        </div>
      )}

      {/* Erro */}
      {errorMessage && (
        <div className="p-2 bg-error/10 border border-error/20 rounded-lg text-xs text-error">
          {errorMessage}
        </div>
      )}

      {/* Botões de Ação */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onBack}
          disabled={sending}
          className="px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text hover:bg-input rounded-lg transition-colors cursor-pointer"
        >
          Voltar
        </button>

        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !to.trim() || !subject.trim()}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-accent text-white font-medium text-xs rounded-lg hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
        >
          {sending ? (
            <>
              <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
              <span>Enviando...</span>
            </>
          ) : (
            <>
              <PaperAirplaneIcon className="w-3.5 h-3.5" />
              <span>Enviar E-mail</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
