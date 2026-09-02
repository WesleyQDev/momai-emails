// src/components/AccountModal.tsx
// Modal to connect a new email account via preset or manual SMTP/IMAP

import React, { useState } from 'react'
import {
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline'
import { PROVIDERS, ProviderId, detectProviderFromEmail } from '../services/providers'

interface AccountModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: any) => Promise<{ ok: boolean; error?: string }>
}

export const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose, onSave }) => {
  const [provider, setProvider] = useState<ProviderId>('gmail')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Custom SMTP/IMAP fields
  const [imapHost, setImapHost] = useState('')
  const [imapPort, setImapPort] = useState(993)
  const [imapSecure, setImapSecure] = useState(true)
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState(587)
  const [smtpSecure, setSmtpSecure] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  if (!isOpen) return null

  const currentPreset = PROVIDERS[provider]

  const handleEmailChange = (newEmail: string) => {
    setEmail(newEmail)
    // Auto detect provider if user hasn't explicitly clicked one
    if (provider !== 'custom') {
      const detected = detectProviderFromEmail(newEmail)
      if (detected && detected !== provider) {
        setProvider(detected)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const payload: any = {
        name: name.trim() || email.split('@')[0],
        email: email.trim(),
        password: password.trim(),
        provider
      }

      if (provider === 'custom') {
        payload.imap = {
          host: imapHost.trim(),
          port: Number(imapPort),
          secure: imapSecure
        }
        payload.smtp = {
          host: smtpHost.trim(),
          port: Number(smtpPort),
          secure: smtpSecure
        }
      }

      const res = await onSave(payload)
      if (!res.ok) {
        setError(res.error || 'Falha ao conectar à conta de e-mail.')
      } else {
        setSuccess(true)
        setTimeout(() => {
          setSuccess(false)
          onClose()
        }, 1200)
      }
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado ao testar conexão.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-xs p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-glass-md overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-sidebar/50">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="w-5 h-5 text-accent" />
            <h2 className="text-base font-semibold text-text">Adicionar Conta de E-mail</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-input text-text-muted hover:text-text transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* Provider selector */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-2">Selecione o Provedor</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {(Object.keys(PROVIDERS) as ProviderId[]).map((key) => {
                const isSelected = provider === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setProvider(key)}
                    className={`py-2 px-1 text-center rounded-lg border font-medium transition-all truncate ${
                      isSelected
                        ? 'border-accent bg-accent/10 text-accent font-semibold shadow-xs'
                        : 'border-border bg-input/40 text-text-muted hover:text-text hover:bg-input'
                    }`}
                  >
                    {PROVIDERS[key].name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Description banner */}
          <div className="p-3 rounded-lg bg-input/30 border border-border text-text-muted leading-relaxed">
            {currentPreset.description}
          </div>

          {/* Name & Email */}
          <div className="space-y-3">
            <div>
              <label className="block font-medium text-text mb-1">Nome de Exibição (opcional)</label>
              <input
                type="text"
                placeholder="Ex: Trabalho, Pessoal ou seu Nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-input border border-border text-text placeholder:text-text-muted focus:outline-hidden focus:border-accent"
              />
            </div>

            <div>
              <label className="block font-medium text-text mb-1">Endereço de E-mail</label>
              <input
                type="email"
                required
                placeholder="seu-email@dominio.com"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-input border border-border text-text placeholder:text-text-muted focus:outline-hidden focus:border-accent"
              />
            </div>

            {/* App Password input with Contextual Link */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-medium text-text">
                  {provider === 'custom' ? 'Senha de E-mail' : 'Senha de Aplicativo (16 dígitos)'}
                </label>

                {currentPreset.appPasswordHelpUrl && (
                  <a
                    href={currentPreset.appPasswordHelpUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline font-medium"
                  >
                    <span>Não possui a senha de aplicativo?</span>
                    <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                  </a>
                )}
              </div>

              <input
                type="password"
                required
                placeholder={provider === 'custom' ? '••••••••' : 'xxxx xxxx xxxx xxxx'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-input border border-border text-text placeholder:text-text-muted focus:outline-hidden focus:border-accent tracking-wider font-mono"
              />
              {provider !== 'custom' && (
                <p className="text-[11px] text-text-muted mt-1.5 leading-normal">
                  Insira a senha de 16 caracteres gerada pelo provedor para clientes SMTP/IMAP.
                </p>
              )}
            </div>
          </div>

          {/* Custom SMTP/IMAP advanced fields */}
          {provider === 'custom' && (
            <div className="p-3 border border-border rounded-lg bg-input/20 space-y-3 mt-3">
              <span className="font-semibold text-text block">Configurações Avançadas do Servidor</span>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-text mb-1">Servidor IMAP (Entrada)</label>
                  <input
                    type="text"
                    required
                    placeholder="imap.seuservidor.com"
                    value={imapHost}
                    onChange={(e) => setImapHost(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-input border border-border text-text"
                  />
                </div>
                <div>
                  <label className="block font-medium text-text mb-1">Porta IMAP</label>
                  <input
                    type="number"
                    required
                    value={imapPort}
                    onChange={(e) => setImapPort(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-input border border-border text-text"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-text mb-1">Servidor SMTP (Saída)</label>
                  <input
                    type="text"
                    required
                    placeholder="smtp.seuservidor.com"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-input border border-border text-text"
                  />
                </div>
                <div>
                  <label className="block font-medium text-text mb-1">Porta SMTP</label>
                  <input
                    type="number"
                    required
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-input border border-border text-text"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-1.5 text-text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={imapSecure}
                    onChange={(e) => setImapSecure(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>IMAP SSL/TLS</span>
                </label>
                <label className="flex items-center gap-1.5 text-text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smtpSecure}
                    onChange={(e) => setSmtpSecure(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>SMTP SSL/TLS</span>
                </label>
              </div>
            </div>
          )}

          {/* Feedback messages */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-input/50 border border-border text-text">
              <ExclamationCircleIcon className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-input/50 border border-accent text-accent font-medium">
              <CheckCircleIcon className="w-4 h-4" />
              <span>Conta conectada e verificada com sucesso!</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg font-medium text-text-muted hover:text-text hover:bg-input transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || success}
              className="flex items-center gap-2 px-5 py-2 rounded-lg font-medium bg-accent text-bg hover:opacity-90 transition-opacity disabled:opacity-50 shadow-sm"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                  <span>Testando Conexão...</span>
                </>
              ) : (
                <span>Testar e Salvar Conta</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
