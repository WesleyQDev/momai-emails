// src/components/ConnectAccountView.tsx
// Full-page provider selection and account connection view with autocomplete and right-click deletion

import React, { useState, useEffect, useRef } from 'react'
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowTopRightOnSquareIcon,
  EyeIcon,
  EyeSlashIcon,
  TrashIcon,
  UserIcon,
  KeyIcon
} from '@heroicons/react/24/outline'
import { GmailIcon, OutlookIcon, YahooIcon, CustomMailIcon } from './ProviderIcons'
import { PROVIDERS, ProviderId, detectProviderFromEmail } from '../services/providers'

interface ConnectAccountViewProps {
  onSave: (data: any) => Promise<{ ok: boolean; error?: string }>
  onCancel?: () => void
  canCancel?: boolean
}

interface AutofillProfile {
  id: string
  email: string
  password?: string
  name?: string
  provider: ProviderId
  imap?: any
  smtp?: any
  savedAt: number
}

const AUTOFILL_KEY = 'momai_emails_autofill_v1'

function getSavedProfiles(): AutofillProfile[] {
  try {
    const raw = localStorage.getItem(AUTOFILL_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveAutofillProfile(profile: Omit<AutofillProfile, 'id' | 'savedAt'>): AutofillProfile[] {
  try {
    const existing = getSavedProfiles()
    const filtered = existing.filter((p) => p.email.toLowerCase() !== profile.email.toLowerCase())
    const newEntry: AutofillProfile = {
      ...profile,
      id: `af_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      savedAt: Date.now()
    }
    const updated = [newEntry, ...filtered].slice(0, 10)
    localStorage.setItem(AUTOFILL_KEY, JSON.stringify(updated))
    return updated
  } catch {
    return []
  }
}

function deleteAutofillProfile(id: string): AutofillProfile[] {
  try {
    const existing = getSavedProfiles()
    const updated = existing.filter((p) => p.id !== id)
    localStorage.setItem(AUTOFILL_KEY, JSON.stringify(updated))
    return updated
  } catch {
    return []
  }
}

export const ConnectAccountView: React.FC<ConnectAccountViewProps> = ({
  onSave,
  onCancel,
  canCancel = false
}) => {
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null)

  // Form states (ordered: Email -> Password -> Display Name)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberCredentials, setRememberCredentials] = useState(true)

  // Custom IMAP/SMTP fields
  const [imapHost, setImapHost] = useState('')
  const [imapPort, setImapPort] = useState(993)
  const [imapSecure, setImapSecure] = useState(true)
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState(587)
  const [smtpSecure, setSmtpSecure] = useState(false)
  const [smtpRequireTLS, setSmtpRequireTLS] = useState(true)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Autocomplete / autofill states
  const [savedProfiles, setSavedProfiles] = useState<AutofillProfile[]>([])
  const [showAutofill, setShowAutofill] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; profileId: string } | null>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)
  const autofillRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSavedProfiles(getSavedProfiles())
  }, [])

  // Close autofill and context menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        autofillRef.current &&
        !autofillRef.current.contains(e.target as Node) &&
        emailInputRef.current &&
        !emailInputRef.current.contains(e.target as Node)
      ) {
        setShowAutofill(false)
      }
      setContextMenu(null)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const handleSelectProvider = (provId: ProviderId) => {
    setSelectedProvider(provId)
    setError(null)
    const preset = PROVIDERS[provId]
    if (preset) {
      setImapHost(preset.imap.host)
      setImapPort(preset.imap.port)
      setImapSecure(preset.imap.secure)
      setSmtpHost(preset.smtp.host)
      setSmtpPort(preset.smtp.port)
      setSmtpSecure(preset.smtp.secure)
      setSmtpRequireTLS(preset.smtp.requireTLS ?? true)
    }
  }

  const handleEmailChange = (newEmail: string) => {
    setEmail(newEmail)
    setShowAutofill(true)
    if (selectedProvider === 'custom') {
      const detected = detectProviderFromEmail(newEmail)
      if (detected && detected !== 'custom') {
        const preset = PROVIDERS[detected]
        if (preset) {
          setImapHost(preset.imap.host)
          setImapPort(preset.imap.port)
          setSmtpHost(preset.smtp.host)
          setSmtpPort(preset.smtp.port)
        }
      }
    }
  }

  // Handle selecting an autocomplete suggestion
  const handleSelectSuggestion = (profile: AutofillProfile) => {
    setEmail(profile.email)
    if (profile.password) setPassword(profile.password)
    if (profile.name) setName(profile.name)
    if (profile.imap) {
      if (profile.imap.host) setImapHost(profile.imap.host)
      if (profile.imap.port) setImapPort(profile.imap.port)
      if (typeof profile.imap.secure === 'boolean') setImapSecure(profile.imap.secure)
    }
    if (profile.smtp) {
      if (profile.smtp.host) setSmtpHost(profile.smtp.host)
      if (profile.smtp.port) setSmtpPort(profile.smtp.port)
      if (typeof profile.smtp.secure === 'boolean') setSmtpSecure(profile.smtp.secure)
      if (typeof profile.smtp.requireTLS === 'boolean') setSmtpRequireTLS(profile.smtp.requireTLS)
    }
    setShowAutofill(false)
  }

  // Handle right-click on an autofill item to show context menu
  const handleItemContextMenu = (e: React.MouseEvent, profileId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      profileId
    })
  }

  // Delete autofill entry
  const handleDeleteSuggestion = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    const updated = deleteAutofillProfile(id)
    setSavedProfiles(updated)
    setContextMenu(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProvider) return
    setError(null)
    setLoading(true)

    try {
      const payload: any = {
        name: name.trim() || email.split('@')[0],
        email: email.trim(),
        password: password.trim(),
        provider: selectedProvider,
        rememberCredentials
      }

      if (selectedProvider === 'custom') {
        payload.imap = {
          host: imapHost.trim(),
          port: Number(imapPort),
          secure: imapSecure
        }
        payload.smtp = {
          host: smtpHost.trim(),
          port: Number(smtpPort),
          secure: smtpSecure,
          requireTLS: smtpRequireTLS
        }
      }

      const res = await onSave(payload)
      if (!res.ok) {
        setError(res.error || 'Falha ao conectar à conta de e-mail. Verifique suas credenciais.')
      } else {
        // Save to autofill if rememberCredentials is on
        if (rememberCredentials) {
          const updated = saveAutofillProfile({
            email: email.trim(),
            password: password.trim(),
            name: name.trim(),
            provider: selectedProvider,
            imap: selectedProvider === 'custom' ? payload.imap : undefined,
            smtp: selectedProvider === 'custom' ? payload.smtp : undefined
          })
          setSavedProfiles(updated)
        }
        setSuccess(true)
      }
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado ao conectar conta.')
    } finally {
      setLoading(false)
    }
  }

  // 1. STEP 1: Provider selection grid (matching the user design)
  if (!selectedProvider) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-bg text-text select-none animate-fade-in relative">
        {canCancel && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="absolute top-6 left-6 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs text-text-muted hover:text-text hover:bg-card transition-all"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            <span>Voltar para Caixa de Entrada</span>
          </button>
        )}

        {/* Header Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-text mb-2 font-sans">
            MomAI Emails
          </h1>
          <p className="text-xs text-text-muted max-w-sm mx-auto">
            Selecione seu provedor de e-mail para conectar sua conta com segurança via IMAP e SMTP.
          </p>
        </div>

        {/* 2x2 Grid of Providers */}
        <div className="grid grid-cols-2 gap-5 w-full max-w-md">
          {/* Gmail */}
          <button
            type="button"
            onClick={() => handleSelectProvider('gmail')}
            className="group flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-border bg-card/60 hover:bg-card hover:border-accent hover:shadow-glass-md transition-all duration-200 hover:-translate-y-1"
          >
            <div className="w-20 h-20 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-200">
              <GmailIcon className="w-16 h-16" />
            </div>
            <span className="text-sm font-semibold text-text group-hover:text-accent transition-colors">
              Gmail
            </span>
          </button>

          {/* Outlook */}
          <button
            type="button"
            onClick={() => handleSelectProvider('outlook')}
            className="group flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-border bg-card/60 hover:bg-card hover:border-accent hover:shadow-glass-md transition-all duration-200 hover:-translate-y-1"
          >
            <div className="w-20 h-20 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-200">
              <OutlookIcon className="w-16 h-16" />
            </div>
            <span className="text-sm font-semibold text-text group-hover:text-accent transition-colors">
              Outlook
            </span>
          </button>

          {/* Yahoo */}
          <button
            type="button"
            onClick={() => handleSelectProvider('yahoo')}
            className="group flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-border bg-card/60 hover:bg-card hover:border-accent hover:shadow-glass-md transition-all duration-200 hover:-translate-y-1"
          >
            <div className="w-20 h-20 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-200">
              <YahooIcon className="w-16 h-16" />
            </div>
            <span className="text-sm font-semibold text-text group-hover:text-accent transition-colors">
              Yahoo!
            </span>
          </button>

          {/* Outros */}
          <button
            type="button"
            onClick={() => handleSelectProvider('custom')}
            className="group flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-border bg-card/60 hover:bg-card hover:border-accent hover:shadow-glass-md transition-all duration-200 hover:-translate-y-1"
          >
            <div className="w-20 h-20 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-200 text-text">
              <CustomMailIcon className="w-16 h-16" />
            </div>
            <span className="text-sm font-semibold text-text group-hover:text-accent transition-colors">
              Outros
            </span>
          </button>
        </div>
      </div>
    )
  }

  // 2. STEP 2: Full-screen connection view (no nested card in card)
  const preset = PROVIDERS[selectedProvider]
  const providerNames: Record<ProviderId, string> = {
    gmail: 'Gmail',
    outlook: 'Outlook / Hotmail',
    hotmail: 'Hotmail',
    yahoo: 'Yahoo Mail',
    custom: 'Outro Provedor (SMTP / IMAP)'
  }

  // Filter autofill suggestions for email input
  const suggestions = savedProfiles.filter((p) => {
    if (selectedProvider && selectedProvider !== 'custom' && p.provider !== selectedProvider) {
      const detected = detectProviderFromEmail(p.email)
      if (detected !== selectedProvider) return false
    }
    if (!email.trim()) return true
    return (
      p.email.toLowerCase().includes(email.toLowerCase()) ||
      (p.name && p.name.toLowerCase().includes(email.toLowerCase()))
    )
  })

  return (
    <div className="w-full h-full flex flex-col bg-bg text-text overflow-y-auto p-6 md:p-10 animate-fade-in relative">
      <div className="w-full max-w-2xl mx-auto flex-1 flex flex-col justify-start space-y-6">
        {/* Top Header & Navigation */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <button
            type="button"
            onClick={() => setSelectedProvider(null)}
            className="inline-flex items-center gap-2 text-xs font-medium text-text-muted hover:text-text px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-input transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span>Voltar</span>
          </button>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-text uppercase tracking-wider">
              {providerNames[selectedProvider]}
            </span>
            <div className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center p-1">
              {selectedProvider === 'gmail' && <GmailIcon className="w-6 h-6" />}
              {selectedProvider === 'outlook' && <OutlookIcon className="w-6 h-6" />}
              {selectedProvider === 'yahoo' && <YahooIcon className="w-6 h-6" />}
              {selectedProvider === 'custom' && <CustomMailIcon className="w-6 h-6 text-text" />}
            </div>
          </div>
        </div>

        {/* Title */}
        <div>
          <h2 className="text-2xl font-bold text-text">
            Conectar conta {providerNames[selectedProvider]}
          </h2>
          <p className="text-xs text-text-muted mt-1">
            {preset.description}
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3.5 rounded-xl bg-input/60 border border-border text-xs text-text flex items-start gap-2.5">
            <ExclamationCircleIcon className="w-4 h-4 text-accent shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Erro de conexão</p>
              <p className="text-text-muted mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Success Notification */}
        {success && (
          <div className="p-3.5 rounded-xl bg-input/60 border border-accent/40 text-xs text-text flex items-center gap-2.5">
            <CheckCircleIcon className="w-4 h-4 text-accent shrink-0" />
            <div>
              <p className="font-semibold text-accent">Conta conectada com sucesso!</p>
              <p className="text-text-muted mt-0.5">Sincronizando suas mensagens...</p>
            </div>
          </div>
        )}

        {/* Form: 1. Email -> 2. Password -> 3. Display Name */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Email with Autocomplete Dropdown */}
          <div className="relative">
            <label className="block text-xs font-semibold text-text mb-1.5">
              Endereço de E-mail *
            </label>
            <input
              ref={emailInputRef}
              type="email"
              required
              autoComplete="off"
              placeholder={
                selectedProvider === 'gmail'
                  ? 'seuemail@gmail.com'
                  : selectedProvider === 'outlook'
                    ? 'seuemail@outlook.com'
                    : selectedProvider === 'yahoo'
                      ? 'seuemail@yahoo.com'
                      : 'voce@seudominio.com'
              }
              value={email}
              onFocus={() => setShowAutofill(true)}
              onChange={(e) => handleEmailChange(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-input border border-border text-xs text-text placeholder:text-text-muted focus:outline-hidden focus:border-accent"
            />

            {/* Autocomplete Dropdown */}
            {showAutofill && suggestions.length > 0 && (
              <div
                ref={autofillRef}
                className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-card border border-border rounded-xl shadow-glass-lg overflow-hidden py-1 max-h-56 overflow-y-auto animate-fade-in"
              >
                {suggestions.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectSuggestion(item)}
                    onContextMenu={(e) => handleItemContextMenu(e, item.id)}
                    className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer hover:bg-input transition-colors group text-xs select-none"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="w-6 h-6 rounded-full bg-sidebar flex items-center justify-center shrink-0 border border-border/60">
                        <UserIcon className="w-3.5 h-3.5 text-text-muted" />
                      </div>
                      <div className="truncate">
                        <span className="font-medium text-text block truncate">{item.email}</span>
                        {item.name && (
                          <span className="text-[10px] text-text-muted block truncate">{item.name}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.password && (
                        <span className="text-[10px] text-accent flex items-center gap-1 font-mono">
                          <KeyIcon className="w-3 h-3" />
                          <span>••••</span>
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSuggestion(item.id, e)}
                        title="Excluir do preenchimento automático"
                        className="p-1 rounded-md text-text-muted hover:text-accent hover:bg-sidebar transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Password with generous left padding */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-text">
                Senha de Aplicativo *
              </label>
              {preset.appPasswordHelpUrl && (
                <a
                  href={preset.appPasswordHelpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                >
                  <span>{preset.appPasswordDocLabel}</span>
                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </a>
              )}
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder={
                  selectedProvider === 'gmail'
                    ? 'Senha de app de 16 letras (ex: abcd efgh ijkl mnop)'
                    : 'Senha de aplicativo gerada na sua conta'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-4 pr-11 py-2.5 rounded-xl bg-input border border-border text-xs text-text placeholder:text-text-muted focus:outline-hidden focus:border-accent font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text p-1"
              >
                {showPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 3. Display Name (opcional) */}
          <div>
            <label className="block text-xs font-semibold text-text mb-1.5">
              Nome de Exibição <span className="text-text-muted font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              placeholder="Ex: Trabalho, Pessoal"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-input border border-border text-xs text-text placeholder:text-text-muted focus:outline-hidden focus:border-accent"
            />
          </div>

          {/* Custom SMTP/IMAP Server Settings if "custom" selected */}
          {selectedProvider === 'custom' && (
            <div className="p-4 rounded-xl border border-border bg-sidebar/30 space-y-4 pt-3">
              <span className="text-xs font-bold text-text uppercase tracking-wider block">
                Configuração de Servidores
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* IMAP */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-accent block">Servidor de Entrada (IMAP)</span>
                  <input
                    type="text"
                    placeholder="imap.seudominio.com"
                    value={imapHost}
                    onChange={(e) => setImapHost(e.target.value)}
                    required
                    className="w-full px-4 py-2 rounded-lg bg-input border border-border text-xs text-text"
                  />
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      placeholder="993"
                      value={imapPort}
                      onChange={(e) => setImapPort(Number(e.target.value))}
                      className="w-24 px-3 py-1.5 rounded-lg bg-input border border-border text-xs text-text"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={imapSecure}
                        onChange={(e) => setImapSecure(e.target.checked)}
                        className="rounded border-border"
                      />
                      <span>SSL / TLS</span>
                    </label>
                  </div>
                </div>

                {/* SMTP */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-accent block">Servidor de Saída (SMTP)</span>
                  <input
                    type="text"
                    placeholder="smtp.seudominio.com"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    required
                    className="w-full px-4 py-2 rounded-lg bg-input border border-border text-xs text-text"
                  />
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      placeholder="587"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(Number(e.target.value))}
                      className="w-24 px-3 py-1.5 rounded-lg bg-input border border-border text-xs text-text"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={smtpSecure}
                        onChange={(e) => setSmtpSecure(e.target.checked)}
                        className="rounded border-border"
                      />
                      <span>SSL</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={smtpRequireTLS}
                        onChange={(e) => setSmtpRequireTLS(e.target.checked)}
                        className="rounded border-border"
                      />
                      <span>STARTTLS</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Checklist simples à esquerda para guardar a senha */}
          <div className="pt-1 pb-1">
            <label className="flex items-center gap-2.5 text-xs text-text cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberCredentials}
                onChange={(e) => setRememberCredentials(e.target.checked)}
                className="w-4 h-4 rounded border-border text-accent focus:ring-accent accent-accent"
              />
              <span>Guardar senha com segurança para reconexão automática</span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-3 px-6 rounded-xl font-semibold text-xs bg-accent text-bg shadow-glass-sm hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                <span>Conectando...</span>
              </>
            ) : (
              <span>Conectar conta</span>
            )}
          </button>
        </form>

        {/* Clean FAQ: Texto objetivo com links dos passos */}
        <div className="pt-6 border-t border-border text-xs text-text-muted space-y-2.5">
          <p className="font-semibold text-text">
            Como obter a senha de aplicativo:
          </p>

          {selectedProvider === 'gmail' && (
            <div className="space-y-1.5 leading-relaxed">
              <p>
                1. Ative a verificação em duas etapas em{' '}
                <a
                  href="https://myaccount.google.com/security"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline inline-flex items-center gap-0.5"
                >
                  myaccount.google.com/security
                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </a>.
              </p>
              <p>
                2. Acesse a página de{' '}
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline font-medium inline-flex items-center gap-0.5"
                >
                  Senhas de aplicativo
                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </a>, crie um novo app com o nome <strong>MomAI</strong> e copie os 16 caracteres gerados.
              </p>
            </div>
          )}

          {selectedProvider === 'outlook' && (
            <div className="space-y-1.5 leading-relaxed">
              <p>
                1. Acesse as opções de{' '}
                <a
                  href="https://account.live.com/proofs/manage/additional"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline font-medium inline-flex items-center gap-0.5"
                >
                  Segurança Adicional da Microsoft
                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </a>.
              </p>
              <p>
                2. Na seção <strong>Senhas de aplicativo</strong>, clique em <strong>Criar nova senha</strong> e cole o código gerado acima.
              </p>
            </div>
          )}

          {selectedProvider === 'yahoo' && (
            <div className="space-y-1.5 leading-relaxed">
              <p>
                1. Acesse{' '}
                <a
                  href="https://login.yahoo.com/account/security"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline font-medium inline-flex items-center gap-0.5"
                >
                  Segurança da Conta Yahoo
                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </a>.
              </p>
              <p>
                2. Clique em <strong>Gerar senha de aplicativo</strong>, digite <strong>MomAI</strong> e copie a senha gerada.
              </p>
            </div>
          )}

          {selectedProvider === 'custom' && (
            <div className="space-y-1.5 leading-relaxed">
              <p>
                Para servidores corporativos, cPanel, Zoho ou Hostgator, utilize as portas <strong>993 (IMAP SSL)</strong> e <strong>587 (SMTP STARTTLS)</strong>. Provedores como Zoho e iCloud exigem senha de app gerada no painel de segurança da conta.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right-click Context Menu for Autocomplete Deletion */}
      {contextMenu && contextMenu.visible && (
        <div
          className="fixed z-60 bg-card border border-border rounded-xl shadow-glass-lg py-1 px-1 text-xs text-text animate-fade-in"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => handleDeleteSuggestion(contextMenu.profileId)}
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
