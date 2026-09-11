// src/services/email-categories.ts
// Gmail-style inbox categories shared by the message list, the badge logic
// and the notification filter. The background worker mirrors these exact
// rules in email-categories.ts; tests assert both copies stay identical.

export type EmailCategory = 'primary' | 'promotions' | 'social' | 'updates'

interface CategoryInput {
  from?: { name?: string | null; address?: string | null } | string | null
  subject?: string | null
}

function readAddress(input: CategoryInput): { from: string; name: string; subject: string } {
  const rawFrom = input?.from
  const address = typeof rawFrom === 'string' ? rawFrom : rawFrom?.address || ''
  const name = typeof rawFrom === 'string' ? '' : rawFrom?.name || ''
  return { from: address.toLowerCase(), name: name.toLowerCase(), subject: (input?.subject || '').toLowerCase() }
}

export function classifyEmailCategory(input: CategoryInput): EmailCategory {
  const { from, name, subject } = readAddress(input)

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

export function shouldNotifyForCategory(category: EmailCategory | string, primaryOnly: boolean): boolean {
  if (!primaryOnly) return true
  return category === 'primary'
}
