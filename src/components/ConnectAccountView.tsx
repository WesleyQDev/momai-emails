// src/components/ConnectAccountView.tsx
// Full-page provider selection and account connection view matching the onboarding design

import React, { useState } from 'react'
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowTopRightOnSquareIcon,
  EyeIcon,
  EyeSlashIcon,
  QuestionMarkCircleIcon,
  LockClosedIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline'
import { GmailIcon, OutlookIcon, YahooIcon, CustomMailIcon } from './ProviderIcons'
import { PROVIDERS, ProviderId, detectProviderFromEmail } from '../services/providers'

interface ConnectAccountViewProps {
  onSave: (data: any) => Promise<{ ok: boolean; error?: string }>
  onCancel?: () => void
  canCancel?: boolean
}

export const ConnectAccountView: React.FC<ConnectAccountViewProps> = ({
  onSave,
  onCancel,
  canCancel = false
}) => {
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null)

  // Form states
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
        setSuccess(true)
      }
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado ao conectar conta.')
    } finally {
      setLoading(false)
    }
  }

  // 1. STEP 1: Provider selection grid (exactly matching the user drawing)
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

  // 2. STEP 2: Full-screen card view for the selected provider
  const preset = PROVIDERS[selectedProvider]
  const providerNames: Record<ProviderId, string> = {
    gmail: 'Gmail',
    outlook: 'Outlook / Hotmail',
    hotmail: 'Hotmail',
    yahoo: 'Yahoo Mail',
    custom: 'Outro Provedor (SMTP / IMAP)'
  }

  return (
    <div className="w-full h-full flex flex-col bg-bg text-text overflow-y-auto p-4 md:p-8 animate-fade-in">
      <div className="max-w-2xl w-full mx-auto space-y-6">
        {/* Top Back Navigation */}
        <button
          type="button"
          onClick={() => setSelectedProvider(null)}
          className="inline-flex items-center gap-2 text-xs font-medium text-text-muted hover:text-text px-3 py-1.5 rounded-lg border border-border bg-card/40 hover:bg-card transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          <span>Voltar para seleção de provedor</span>
        </button>

        {/* Card Container */}
        <div className="bg-card border border-border rounded-2xl shadow-glass-md overflow-hidden p-6 md:p-8 space-y-6">
          {/* Card Header with Provider Icon and Title */}
          <div className="flex items-center gap-4 pb-6 border-b border-border">
            <div className="w-14 h-14 shrink-0 rounded-xl bg-sidebar/50 border border-border flex items-center justify-center p-2">
              {selectedProvider === 'gmail' && <GmailIcon className="w-10 h-10" />}
              {selectedProvider === 'outlook' && <OutlookIcon className="w-10 h-10" />}
              {selectedProvider === 'yahoo' && <YahooIcon className="w-10 h-10" />}
              {selectedProvider === 'custom' && <CustomMailIcon className="w-10 h-10 text-text" />}
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-text">
                Conectar conta {providerNames[selectedProvider]}
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                {preset.description}
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-xl bg-input/40 border border-border text-xs text-text flex items-start gap-3">
              <ExclamationCircleIcon className="w-5 h-5 text-accent shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Erro ao conectar</p>
                <p className="text-text-muted mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="p-4 rounded-xl bg-input/40 border border-accent/40 text-xs text-text flex items-center gap-3">
              <CheckCircleIcon className="w-5 h-5 text-accent shrink-0" />
              <div>
                <p className="font-semibold text-accent">Conta conectada com sucesso!</p>
                <p className="text-text-muted mt-0.5">Sincronizando suas mensagens...</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-text mb-1.5">
                  Nome de Exibição
                </label>
                <input
                  type="text"
                  placeholder="Ex: Trabalho, Pessoal"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border text-xs text-text placeholder:text-text-muted focus:outline-hidden focus:border-accent"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-text mb-1.5">
                  Endereço de E-mail *
                </label>
                <input
                  type="email"
                  required
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
                  onChange={(e) => handleEmailChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border text-xs text-text placeholder:text-text-muted focus:outline-hidden focus:border-accent"
                />
              </div>
            </div>

            {/* App Password */}
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
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-input border border-border text-xs text-text placeholder:text-text-muted focus:outline-hidden focus:border-accent font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                >
                  {showPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </div>
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
                      className="w-full px-3 py-2 rounded-lg bg-input border border-border text-xs text-text"
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
                      className="w-full px-3 py-2 rounded-lg bg-input border border-border text-xs text-text"
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

            {/* Checkin para guardar a senha */}
            <div className="pt-2 pb-1">
              <label className="flex items-center gap-3 p-3 rounded-xl border border-border bg-sidebar/20 hover:bg-sidebar/40 cursor-pointer select-none transition-colors">
                <input
                  type="checkbox"
                  checked={rememberCredentials}
                  onChange={(e) => setRememberCredentials(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-accent focus:ring-accent accent-accent"
                />
                <div className="flex items-center gap-2 text-xs">
                  <ShieldCheckIcon className="w-4 h-4 text-accent shrink-0" />
                  <span className="font-medium text-text">
                    Guardar senha com segurança para reconexão automática
                  </span>
                </div>
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
                  <span>Testando e conectando...</span>
                </>
              ) : (
                <span>Conectar conta</span>
              )}
            </button>
          </form>

          {/* FAQ Section at bottom */}
          <div className="pt-6 border-t border-border space-y-4">
            <div className="flex items-center gap-2">
              <QuestionMarkCircleIcon className="w-5 h-5 text-accent" />
              <h3 className="text-sm font-bold text-text">
                FAQ — Como obter a senha de aplicativo?
              </h3>
            </div>

            {selectedProvider === 'gmail' && (
              <div className="p-4 rounded-xl bg-sidebar/30 border border-border text-xs text-text-muted space-y-3">
                <p className="text-text font-semibold">
                  O Gmail exige uma "Senha de Aplicativo" de 16 dígitos para clientes IMAP/SMTP:
                </p>
                <ol className="list-decimal list-inside space-y-2 leading-relaxed">
                  <li>
                    Acesse sua Conta Google em{' '}
                    <a
                      href="https://myaccount.google.com/security"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline font-medium"
                    >
                      myaccount.google.com/security
                    </a>
                  </li>
                  <li>
                    Na aba <strong>Segurança</strong>, certifique-se de que a <strong>Verificação em duas etapas</strong> está <strong>Ativada</strong>.
                  </li>
                  <li>
                    Acesse a página de{' '}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline font-medium inline-flex items-center gap-1"
                    >
                      <span>Senhas de aplicativo</span>
                      <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                    </a>
                  </li>
                  <li>
                    No campo "Nome do app", digite <strong>MomAI</strong> e clique em <strong>Criar</strong>.
                  </li>
                  <li>
                    Copie a senha de 16 letras gerada (você pode digitar com ou sem os espaços) e cole no campo acima.
                  </li>
                </ol>
                <div className="p-2.5 rounded-lg bg-input/40 border border-border text-[11px] text-text flex items-center gap-2">
                  <LockClosedIcon className="w-4 h-4 text-accent shrink-0" />
                  <span>Sua senha principal do Google não é compartilhada e permanece protegida.</span>
                </div>
              </div>
            )}

            {selectedProvider === 'outlook' && (
              <div className="p-4 rounded-xl bg-sidebar/30 border border-border text-xs text-text-muted space-y-3">
                <p className="text-text font-semibold">
                  Passo a passo para contas @outlook.com, @hotmail.com e @live.com:
                </p>
                <ol className="list-decimal list-inside space-y-2 leading-relaxed">
                  <li>
                    Acesse o painel de segurança da Microsoft em{' '}
                    <a
                      href="https://account.live.com/proofs/manage/additional"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline font-medium inline-flex items-center gap-1"
                    >
                      <span>Segurança Adicional da Conta</span>
                      <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                    </a>
                  </li>
                  <li>
                    Ative a <strong>Verificação em duas etapas</strong> se ainda não estiver ativa.
                  </li>
                  <li>
                    Na seção <strong>Senhas de aplicativo</strong>, clique em <strong>Criar uma nova senha de aplicativo</strong>.
                  </li>
                  <li>
                    Copie o código gerado e cole no campo de senha acima.
                  </li>
                </ol>
              </div>
            )}

            {selectedProvider === 'yahoo' && (
              <div className="p-4 rounded-xl bg-sidebar/30 border border-border text-xs text-text-muted space-y-3">
                <p className="text-text font-semibold">
                  Passo a passo para contas Yahoo Mail:
                </p>
                <ol className="list-decimal list-inside space-y-2 leading-relaxed">
                  <li>
                    Acesse a página de{' '}
                    <a
                      href="https://login.yahoo.com/account/security"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline font-medium inline-flex items-center gap-1"
                    >
                      <span>Segurança da Conta Yahoo</span>
                      <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                    </a>
                  </li>
                  <li>
                    Role até <strong>Senhas de aplicativo</strong> e clique em <strong>Gerar senha de aplicativo</strong>.
                  </li>
                  <li>
                    Digite <strong>MomAI</strong> e clique em Gerar.
                  </li>
                  <li>
                    Copie a senha de 16 dígitos e cole no campo acima.
                  </li>
                </ol>
              </div>
            )}

            {selectedProvider === 'custom' && (
              <div className="p-4 rounded-xl bg-sidebar/30 border border-border text-xs text-text-muted space-y-3">
                <p className="text-text font-semibold">
                  Servidores Corporativos, cPanel, Hostgator, Locaweb, Zoho, iCloud:
                </p>
                <ul className="list-disc list-inside space-y-1.5 leading-relaxed">
                  <li>
                    <strong>Portas recomendadas:</strong> IMAP porta <strong>993</strong> com SSL/TLS ativado; SMTP porta <strong>587</strong> com STARTTLS ou <strong>465</strong> com SSL.
                  </li>
                  <li>
                    <strong>Zoho Mail:</strong> Exige que você gere uma senha de aplicativo em <em>Zoho Accounts &gt; Segurança &gt; Senhas de Aplicativo</em>.
                  </li>
                  <li>
                    <strong>iCloud:</strong> Exige senha de app gerada em <em>appleid.apple.com</em>.
                  </li>
                  <li>
                    <strong>cPanel / Webmail corporativo:</strong> Geralmente utiliza a mesma senha do seu webmail ou a senha de e-mail criada no painel.
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
