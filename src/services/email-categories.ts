// src/services/email-categories.ts
// Gmail-style inbox categories shared by the message list, the badge logic
// and the notification filter. The background worker mirrors these exact
// rules in email-categories.ts; tests assert both copies stay identical.

export type EmailCategory = 'primary' | 'promotions' | 'social' | 'updates'

export interface CategoryInput {
  from?: { name?: string | null; address?: string | null } | string | null
  subject?: string | null
  labels?: string[] | Set<string> | null
  rawLabels?: string[] | Set<string> | null
  xGmLabels?: string[] | Set<string> | null
  /** Real category resolved by the server (Gmail X-GM-RAW); wins over heuristics. */
  category?: string | null
}

function extractLabels(input: CategoryInput): string[] {
  if (!input) return []
  const raw = input.labels || input.rawLabels || input.xGmLabels
  if (Array.isArray(raw)) return raw.map(String)
  if (raw && typeof (raw as any)[Symbol.iterator] === 'function' && typeof raw !== 'string') {
    return Array.from(raw).map(String)
  }
  return []
}

function readAddress(input: CategoryInput): { from: string; name: string; subject: string } {
  const rawFrom = input?.from
  const address = typeof rawFrom === 'string' ? rawFrom : rawFrom?.address || ''
  const name = typeof rawFrom === 'string' ? '' : rawFrom?.name || ''
  return { from: address.toLowerCase(), name: name.toLowerCase(), subject: (input?.subject || '').toLowerCase() }
}

// Server-provided categories (Gmail X-GM-RAW) win over local heuristics.
const EXPLICIT_CATEGORY_MAP: Record<string, EmailCategory> = {
  primary: 'primary',
  personal: 'primary',
  promotions: 'promotions',
  social: 'social',
  updates: 'updates',
  forums: 'updates'
}

function normalizeExplicitCategory(value?: string | null): EmailCategory | null {
  if (!value) return null
  return EXPLICIT_CATEGORY_MAP[String(value).toLowerCase()] || null
}

// Senders pinned to Updates, even when Gmail itself puts them in Primary:
// GitHub notification mail belongs under Atualizações by user preference.
const PINNED_UPDATE_SENDERS = ['notifications@github.com']

function isPinnedUpdateSender(from: string): boolean {
  return PINNED_UPDATE_SENDERS.some((sender) => from.includes(sender))
}

export function classifyEmailCategory(input: CategoryInput): EmailCategory {
  const { from, name, subject } = readAddress(input)

  if (isPinnedUpdateSender(from)) return 'updates'

  const explicit = normalizeExplicitCategory(input?.category)
  if (explicit) return explicit

  const labels = extractLabels(input)
  if (labels.length > 0) {
    const lowerLabels = labels.map((l) => l.toLowerCase())
    if (lowerLabels.some((l) => l.includes('smartlabel_promo') || l.includes('promotions') || l.includes('promoções') || l.includes('category_promotions') || l.includes('category promotions') || l.includes('category-promotions'))) {
      return 'promotions'
    }
    if (lowerLabels.some((l) => l.includes('smartlabel_social') || l.includes('category_social') || l.includes('category social') || l.includes('category-social') || l.includes('social'))) {
      return 'social'
    }
    if (lowerLabels.some((l) => l.includes('smartlabel_notification') || l.includes('smartlabel_update') || l.includes('category_updates') || l.includes('category updates') || l.includes('category-updates') || l.includes('atualizações') || l.includes('smartlabel_group') || l.includes('category_forums') || l.includes('category forums') || l.includes('category-forums') || l.includes('fóruns') || l.includes('updates'))) {
      return 'updates'
    }
    if (lowerLabels.some((l) => l.includes('smartlabel_personal') || l.includes('category_personal') || l.includes('category personal') || l.includes('category-personal') || l.includes('principal') || l.includes('primary') || l.includes('personal'))) {
      return 'primary'
    }
  }

  if (from.includes('calendar') || (from.includes('google') && from.includes('event'))) return 'primary'

  // 1. Social network domains
  const socialDomains = ['facebook', 'twitter', 'linkedin', 'instagram', 'tiktok', 'pinterest', 'reddit', 'discord', 'snapchat', 'twitch']
  if (socialDomains.some((d) => from.includes(d) || name.includes(d))) return 'social'

  // 2. Automated bounce system domains
  const updateDomains = ['postmaster@', 'mailer-daemon@', 'system-notice@']
  if (updateDomains.some((d) => from.includes(d))) return 'updates'

  // 3. Dedicated marketing & newsletter sender addresses
  const promoSenders = ['news@', 'promo@', 'promocoes@', 'ofertas@', 'newsletter@', 'deals@', 'marketing@', 'mailchimp.com', 'sendgrid.net', 'hubspot.com']
  if (promoSenders.some((d) => from.includes(d))) return 'promotions'

  // 4. Default: Primary (preserves the exact chronological mailbox order from Gmail)
  return 'primary'
}

export function shouldNotifyForCategory(category: EmailCategory | string, primaryOnly: boolean): boolean {
  if (!primaryOnly) return true
  return category === 'primary'
}

export function countByCategory(messages: CategoryInput[]): Record<EmailCategory, number> {
  const counts: Record<EmailCategory, number> = { primary: 0, promotions: 0, social: 0, updates: 0 }
  for (const message of messages) {
    counts[classifyEmailCategory(message)] += 1
  }
  return counts
}
