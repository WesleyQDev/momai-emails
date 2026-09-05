// src/services/i18n.ts
// Extension locale resolution and translation helpers.
// Uses sdk.i18n when available, with direct fallback to the host locale
// stored in localStorage, so the UI keeps working even if the SDK surface
// does not expose the i18n module yet.

import { useCallback, useEffect, useState } from 'react'
import ptBRDict from '../locales/pt-BR.json'
import enUSDict from '../locales/en-US.json'
import esDict from '../locales/es.json'
import deDict from '../locales/de.json'
import frDict from '../locales/fr.json'
import itDict from '../locales/it.json'

export type ExtensionLocale = 'pt-BR' | 'en-US' | 'es' | 'de' | 'fr' | 'it'

type Dictionary = Record<string, string>

const DICTIONARIES: Record<ExtensionLocale, Dictionary> = {
  'pt-BR': ptBRDict as Dictionary,
  'en-US': enUSDict as Dictionary,
  es: esDict as Dictionary,
  de: deDict as Dictionary,
  fr: frDict as Dictionary,
  it: itDict as Dictionary
}

const DEFAULT_LOCALE: ExtensionLocale = 'pt-BR'

export function normalizeLocale(value?: string | null): ExtensionLocale {
  if (!value) return DEFAULT_LOCALE
  const normalized = value.trim()
  if (normalized in DICTIONARIES) return normalized as ExtensionLocale
  if (normalized === 'pt_BR') return 'pt-BR'
  if (normalized === 'en_US') return 'en-US'
  const lower = normalized.toLowerCase()
  if (lower.startsWith('pt')) return 'pt-BR'
  if (lower.startsWith('en')) return 'en-US'
  if (lower.startsWith('es')) return 'es'
  if (lower.startsWith('de')) return 'de'
  if (lower.startsWith('fr')) return 'fr'
  if (lower.startsWith('it')) return 'it'
  return DEFAULT_LOCALE
}

function readSdk(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('momai:sdk')
    return mod?.default ?? mod ?? null
  } catch {
    return null
  }
}

export function getExtensionLocale(): ExtensionLocale {
  try {
    const sdk = (globalThis as any)?.MomAISDK ?? readSdk()
    const fromSdk = sdk?.i18n?.getLocale?.()
    if (typeof fromSdk === 'string' && fromSdk) return normalizeLocale(fromSdk)
  } catch {
    // Fall through to host storage below.
  }
  try {
    if (typeof window !== 'undefined') {
      const fromWindow = (window as any).__MOMAI_LOCALE__
      if (typeof fromWindow === 'string' && fromWindow) return normalizeLocale(fromWindow)
      const stored = window.localStorage?.getItem('momai_locale')
      if (stored) return normalizeLocale(stored)
      if (window.navigator?.language) return normalizeLocale(window.navigator.language)
    }
  } catch {
    // Keep default locale.
  }
  return DEFAULT_LOCALE
}

export function translate(locale: ExtensionLocale, key: string, vars?: Record<string, string | number>): string {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE]
  let text = dict[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key
  if (vars) {
    for (const [varKey, varValue] of Object.entries(vars)) {
      text = text.replaceAll(`{${varKey}}`, String(varValue))
    }
  }
  return text
}

export function useExtensionLocale(): { locale: ExtensionLocale; t: (key: string, vars?: Record<string, string | number>) => string } {
  const [locale, setLocale] = useState<ExtensionLocale>(() => getExtensionLocale())

  useEffect(() => {
    const cleanups: Array<() => void> = []
    try {
      const sdk = (globalThis as any)?.MomAISDK ?? readSdk()
      if (sdk?.i18n?.onLocaleChange) {
        cleanups.push(sdk.i18n.onLocaleChange((next: string) => setLocale(normalizeLocale(next))))
      }
    } catch {
      // SDK locale subscription is optional.
    }
    if (typeof window === 'undefined') return () => {}
    const handleCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ locale?: string }>).detail
      setLocale(normalizeLocale(detail?.locale ?? (window as any).__MOMAI_LOCALE__))
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'momai_locale') setLocale(normalizeLocale(event.newValue))
    }
    window.addEventListener('momai:locale-changed', handleCustom)
    window.addEventListener('storage', handleStorage)
    cleanups.push(() => {
      window.removeEventListener('momai:locale-changed', handleCustom)
      window.removeEventListener('storage', handleStorage)
    })
    return () => {
      for (const cleanup of cleanups) {
        try {
          cleanup()
        } catch {
          // Ignore cleanup errors.
        }
      }
    }
  }, [])

  const t = useCallback((key: string, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale])
  return { locale, t }
}

const FOLDER_KEY_BY_NAME: Record<string, string> = {
  inbox: 'folders.inbox',
  'all mail': 'folders.all',
  all: 'folders.all',
  drafts: 'folders.drafts',
  draft: 'folders.drafts',
  important: 'folders.important',
  'sent mail': 'folders.sent',
  sent: 'folders.sent',
  'sent messages': 'folders.sent',
  spam: 'folders.spam',
  junk: 'folders.spam',
  starred: 'folders.starred',
  trash: 'folders.trash',
  bin: 'folders.trash',
  'deleted items': 'folders.trash',
  archive: 'folders.archive'
}

const FOLDER_KEY_BY_ROLE: Record<string, string> = {
  inbox: 'folders.inbox',
  all: 'folders.all',
  allmail: 'folders.all',
  drafts: 'folders.drafts',
  important: 'folders.important',
  sent: 'folders.sent',
  junk: 'folders.spam',
  spam: 'folders.spam',
  starred: 'folders.starred',
  trash: 'folders.trash',
  archive: 'folders.archive'
}

export const FOLDER_TRANSLATIONS: Record<string, string> = {
  inbox: 'Caixa de Entrada',
  'all mail': 'Todos os E-mails',
  all: 'Todos os E-mails',
  'todos os e-mails': 'Todos os E-mails',
  drafts: 'Rascunhos',
  draft: 'Rascunhos',
  rascunhos: 'Rascunhos',
  important: 'Importantes',
  importantes: 'Importantes',
  'sent mail': 'Enviados',
  sent: 'Enviados',
  'sent messages': 'Enviados',
  enviados: 'Enviados',
  'itens enviados': 'Enviados',
  spam: 'Spam',
  junk: 'Spam',
  'lixo eletrônico': 'Spam',
  starred: 'Com Estrela',
  'com estrela': 'Com Estrela',
  trash: 'Lixeira',
  bin: 'Lixeira',
  'deleted items': 'Lixeira',
  'itens excluídos': 'Lixeira',
  lixeira: 'Lixeira',
  archive: 'Arquivo',
  arquivo: 'Arquivo'
}

export const CATEGORY_TRANSLATIONS: Record<string, { label: string; description: string }> = {
  primary: {
    label: 'Principal',
    description: 'Conversas pessoais e e-mails diretos'
  },
  promotions: {
    label: 'Promoções',
    description: 'Ofertas, novidades e e-mails de marketing'
  },
  social: {
    label: 'Social',
    description: 'Mensagens de redes sociais e mídias'
  },
  updates: {
    label: 'Atualizações',
    description: 'Notificações, confirmações e recibos'
  }
}

export function getCategoryInfo(id: string, locale: ExtensionLocale = DEFAULT_LOCALE): { label: string; description: string } {
  const normalized = (id || '').toLowerCase()
  const label = translate(locale, `categories.${normalized}.label`)
  const description = translate(locale, `categories.${normalized}.description`)
  if (!label.startsWith('categories.') && !description.startsWith('categories.')) {
    return { label, description }
  }
  return CATEGORY_TRANSLATIONS[normalized] ?? { label: id, description: '' }
}

/**
 * Format folder name for user-facing UI in the active locale.
 */
export function formatFolderName(name: string, role?: string, locale: ExtensionLocale = DEFAULT_LOCALE): string {
  if (!name) return ''
  const cleanName = name.replace(/^\[Gmail\]\/?/i, '').trim()
  const lower = cleanName.toLowerCase()

  if (locale === DEFAULT_LOCALE && FOLDER_TRANSLATIONS[lower]) {
    return FOLDER_TRANSLATIONS[lower]
  }
  const keyByName = FOLDER_KEY_BY_NAME[lower]
  if (keyByName) return translate(locale, keyByName)

  if (role) {
    const roleKey = FOLDER_KEY_BY_ROLE[role.toLowerCase()]
    if (roleKey) return translate(locale, roleKey)
  }

  return cleanName
}

export function formatListDate(timestamp: number, locale: ExtensionLocale = DEFAULT_LOCALE): string {
  if (!timestamp) return ''
  const msgDate = new Date(timestamp)
  const today = new Date()
  const isToday =
    msgDate.getDate() === today.getDate() &&
    msgDate.getMonth() === today.getMonth() &&
    msgDate.getFullYear() === today.getFullYear()
  if (isToday) {
    return msgDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  }
  return msgDate.toLocaleDateString(locale, { day: '2-digit', month: 'short' })
}

export function formatFullDate(timestamp: number, locale: ExtensionLocale = DEFAULT_LOCALE): string {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleString(locale, {
    weekday: 'short',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
