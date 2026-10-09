// email-categories.ts
// Gmail-style inbox categories for the background worker. Mirrors the UI copy
// in src/services/email-categories.ts (the worker cannot bundle UI modules),
// and tests assert both copies classify identically.

'use strict'

function extractLabels(input) {
  if (!input) return []
  const raw = input.labels || input.rawLabels || input.xGmLabels
  if (Array.isArray(raw)) return raw.map(String)
  if (raw && typeof raw[Symbol.iterator] === 'function' && typeof raw !== 'string') {
    return Array.from(raw).map(String)
  }
  return []
}

function readAddress(input) {
  const rawFrom = input ? input.from : null
  const address = typeof rawFrom === 'string' ? rawFrom : (rawFrom && (rawFrom.address || '')) || ''
  const name = typeof rawFrom === 'string' ? '' : (rawFrom && (rawFrom.name || '')) || ''
  return {
    from: String(address).toLowerCase(),
    name: String(name).toLowerCase(),
    subject: String((input && input.subject) || '').toLowerCase()
  }
}

// Server-provided categories (Gmail X-GM-RAW) win over local heuristics.
const EXPLICIT_CATEGORY_MAP = {
  primary: 'primary',
  personal: 'primary',
  promotions: 'promotions',
  social: 'social',
  updates: 'updates',
  forums: 'updates'
}

function normalizeExplicitCategory(value) {
  if (!value) return null
  return EXPLICIT_CATEGORY_MAP[String(value).toLowerCase()] || null
}

function classifyEmailCategory(input) {
  const parts = readAddress(input || {})
  const from = parts.from
  const name = parts.name
  const subject = parts.subject

  const explicit = normalizeExplicitCategory(input && input.category)
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

function shouldNotifyForCategory(category, primaryOnly) {
  if (!primaryOnly) return true
  return category === 'primary'
}

module.exports = {
  classifyEmailCategory,
  shouldNotifyForCategory
}
