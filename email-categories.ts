// email-categories.ts
// Gmail-style inbox categories for the background worker. Mirrors the UI copy
// in src/services/email-categories.ts (the worker cannot bundle UI modules),
// and tests assert both copies classify identically.

'use strict'

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

function classifyEmailCategory(input) {
  const parts = readAddress(input || {})
  const from = parts.from
  const name = parts.name
  const subject = parts.subject

  const socialDomains = ['facebook', 'twitter', 'linkedin', 'instagram', 'tiktok', 'pinterest', 'reddit', 'discord', 'slack', 'whatsapp', 'telegram', 'snapchat', 'youtube', 'twitch', 'github', 'gitlab', 'meetup', 'quora', 'tumblr']
  if (socialDomains.some((d) => from.includes(d))) return 'social'
  const socialKeywords = ['friend request', 'solicitação de amizade', 'seguiu você', 'followed you', 'mentioned you', 'mencionou você', 'commented', 'comentou', 'liked', 'curtiu', 'shared', 'compartilhou', 'tagged', 'marcou', 'invite', 'convite', 'joined', 'entrou']
  if (socialKeywords.some((k) => subject.includes(k) || name.includes(k))) return 'social'

  const promoDomains = ['newsletter', 'marketing', 'promo', 'noreply', 'no-reply', 'news@', 'offers', 'deals', 'shop', 'store', 'sale', 'mailer', 'campaign', 'mailchimp', 'sendgrid', 'hubspot', 'mailgun']
  if (promoDomains.some((d) => from.includes(d))) return 'promotions'
  const promoKeywords = ['unsubscribe', 'cancelar inscrição', 'descadastrar', 'oferta', 'offer', 'promoção', 'promotion', 'desconto', 'discount', 'cupom', 'coupon', 'sale', 'deal', 'newsletter', 'black friday', 'frete grátis', 'free shipping', 'compre', 'buy now', 'limited time', 'tempo limitado', 'exclusivo', 'exclusive']
  if (promoKeywords.some((k) => subject.includes(k))) return 'promotions'

  const updateDomains = ['notify', 'notification', 'alert', 'update', 'security', 'account', 'billing', 'support', 'service', 'info@', 'system', 'admin', 'postmaster', 'mailer-daemon']
  if (updateDomains.some((d) => from.includes(d))) return 'updates'
  const updateKeywords = ['verificação', 'verification', 'confirmação', 'confirmation', 'senha', 'password', 'código', 'code', 'login', 'acesso', 'segurança', 'security', 'atualização', 'update', 'fatura', 'invoice', 'recibo', 'receipt', 'pagamento', 'payment', 'entrega', 'delivery', 'rastreio', 'tracking', 'pedido', 'order']
  if (updateKeywords.some((k) => subject.includes(k))) return 'updates'

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
