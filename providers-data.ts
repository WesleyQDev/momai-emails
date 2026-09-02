// providers-data.ts
// CommonJS presets for email providers used by backend worker

'use strict'

const PROVIDERS = {
  gmail: {
    id: 'gmail',
    name: 'Gmail',
    imap: {
      host: 'imap.gmail.com',
      port: 993,
      secure: true
    },
    smtp: {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true
    },
    appPasswordHelpUrl: 'https://myaccount.google.com/apppasswords',
    appPasswordDocLabel: 'Gerar Senha de Aplicativo no Google',
    description: 'Conecte sua conta do Google usando uma senha de app de 16 dígitos (requer verificação em duas etapas).'
  },
  outlook: {
    id: 'outlook',
    name: 'Outlook',
    imap: {
      host: 'outlook.office365.com',
      port: 993,
      secure: true
    },
    smtp: {
      host: 'smtp-mail.outlook.com',
      port: 587,
      secure: false,
      requireTLS: true
    },
    appPasswordHelpUrl: 'https://account.live.com/proofs/manage/additional',
    appPasswordDocLabel: 'Gerar Senha de Aplicativo na Microsoft',
    description: 'Conecte sua conta @outlook.com ou @live.com com sua senha de app de 16 dígitos da Microsoft.'
  },
  hotmail: {
    id: 'hotmail',
    name: 'Hotmail',
    imap: {
      host: 'outlook.office365.com',
      port: 993,
      secure: true
    },
    smtp: {
      host: 'smtp-mail.outlook.com',
      port: 587,
      secure: false,
      requireTLS: true
    },
    appPasswordHelpUrl: 'https://account.live.com/proofs/manage/additional',
    appPasswordDocLabel: 'Gerar Senha de Aplicativo no Hotmail/Microsoft',
    description: 'Conecte sua conta @hotmail.com com a senha de aplicativo de 16 dígitos da Microsoft.'
  },
  yahoo: {
    id: 'yahoo',
    name: 'Yahoo Mail',
    imap: {
      host: 'imap.mail.yahoo.com',
      port: 993,
      secure: true
    },
    smtp: {
      host: 'smtp.mail.yahoo.com',
      port: 465,
      secure: true
    },
    appPasswordHelpUrl: 'https://login.yahoo.com/account/security',
    appPasswordDocLabel: 'Gerar Senha de Aplicativo no Yahoo',
    description: 'Conecte sua conta do Yahoo gerando uma senha de app de terceiros na segurança da conta.'
  },
  custom: {
    id: 'custom',
    name: 'Personalizado (SMTP/IMAP)',
    imap: {
      host: '',
      port: 993,
      secure: true
    },
    smtp: {
      host: '',
      port: 587,
      secure: false,
      requireTLS: true
    },
    appPasswordHelpUrl: '',
    appPasswordDocLabel: 'Configuração Manual de Servidor',
    description: 'Configure manualmente qualquer servidor IMAP e SMTP corporativo ou privado.'
  }
}

function detectProviderFromEmail(email: string): string {
  const domain = email.split('@')[1]?.toLowerCase().trim() || ''
  if (domain.includes('gmail.com') || domain.includes('googlemail.com')) return 'gmail'
  if (domain.includes('outlook.com') || domain.includes('live.com') || domain.includes('msn.com')) return 'outlook'
  if (domain.includes('hotmail.com')) return 'hotmail'
  if (domain.includes('yahoo.com') || domain.includes('yahoo.com.br') || domain.includes('ymail.com')) return 'yahoo'
  return 'custom'
}

module.exports = {
  PROVIDERS,
  detectProviderFromEmail
}
