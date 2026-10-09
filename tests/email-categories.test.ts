import { describe, it, expect } from 'vitest'
import { classifyEmailCategory, shouldNotifyForCategory, countByCategory } from '../src/services/email-categories'
import { classifyEmailCategory as classifyWorker, shouldNotifyForCategory as shouldNotifyWorker } from '../email-categories'

const CASES: Array<{ from: any; subject: string; labels?: string[]; category?: string; expected: string }> = [
  { from: { address: 'ana@empresa.com', name: 'Ana' }, subject: 'Reunião amanhã', expected: 'primary' },
  { from: { address: 'news@loja.com', name: '' }, subject: 'Oferta exclusiva', category: 'promotions', expected: 'promotions' },
  { from: { address: 'newsletter@site.com', name: '' }, subject: 'Novidades da semana', labels: ['\\Category-Promotions'], expected: 'promotions' },
  { from: { address: 'noreply@facebook.com', name: '' }, subject: 'Nova mensagem', category: 'social', expected: 'social' },
  { from: { address: 'inmail-hit-reply@linkedin.com', name: '' }, subject: 'Nova mensagem de recrutador', labels: ['category-social'], expected: 'social' },
  { from: { address: 'alerts@github.com', name: '' }, subject: 'PR merged', labels: ['^smartlabel_notification'], expected: 'updates' },
  { from: { address: 'noreply@github.com', name: '' }, subject: 'Your Copilot report is ready', labels: ['\\Inbox', '\\Important'], expected: 'primary' },
  { from: { address: 'copilot@github.com', name: '' }, subject: 'Copilot usage summary', labels: ['\\Inbox'], expected: 'primary' },
  { from: { address: 'security@banco.com', name: '' }, subject: 'Seu código de acesso', labels: ['^smartlabel_notification'], expected: 'updates' },
  { from: { address: 'contato@noreply-shop.com', name: '' }, subject: 'Cupom de desconto', category: 'promotions', expected: 'promotions' },
  { from: { address: 'calendar-notification@google.com', name: '' }, subject: 'Convite: Reunião de equipe', expected: 'primary' },
  { from: { address: 'events-noreply@google.com', name: '' }, subject: 'Detalhes do seu evento', expected: 'primary' },
  { from: 'joao@email.com', subject: 'Oi', expected: 'primary' },
  // Real-world cases from user screenshots (exact same chronological list as Gmail's Principal):
  { from: { address: 'notifications@github.com', name: 'Wesley Queiroz 2' }, subject: '[WesleyQDev/gpu-lab] Run failed: pages build and deployment - main (fa928ee)', expected: 'primary' },
  { from: { address: 'noreply@steampowered.com', name: 'Steam' }, subject: 'A Promoção de Primavera do Steam está no ar, com ofertas recomendadas para você.', expected: 'primary' },
  { from: { address: 'digital@bancodobrasil.com.br', name: 'digital' }, subject: 'FATURA CLIENTE - OUROCARD FACIL VISA - Banco do Brasil', expected: 'primary' },
  { from: { address: 'notifications@github.com', name: 'Copilot' }, subject: 'Re: [WesleyQDev/momai] chore(daily): checkpoint 2026-10-05 (PR #470)', expected: 'primary' },
  { from: { address: 'noreply@indeed.com', name: 'Indeed' }, subject: 'Desenvolvedor Backend na empresa Gaudium - R$ 9.974,70', expected: 'primary' },
  { from: { address: 'santander@santander.com.br', name: 'Santander Open Acad.' }, subject: 'Temos novidades sobre a tua candidatura', expected: 'primary' },
  { from: { address: 'noreply@cloudflare.com', name: 'Cloudflare' }, subject: "That's a wrap on our 16th Birthday Week!", expected: 'primary' },
  { from: { address: 'jobgether@email.com', name: 'Jobgether via Linke.' }, subject: 'How to Tailor Your Resume for Director-Level Remote Jobs', expected: 'primary' },
  { from: { address: 'vagas@site.com', name: 'Alertas de vaga do .' }, subject: 'Estágio Tecnologia da Informação Análise e Desenvolvimento de Sistemas', expected: 'primary' },
  { from: { address: 'no-reply@accounts.google.com', name: 'Google' }, subject: 'Você compartilhou alguns dados da sua Conta do Google com Xmind', expected: 'primary' },
  { from: { address: 'share@tailscale.com', name: 'Tailscale' }, subject: 'Anderson Tavares shared a device with you over Tailscale', expected: 'primary' },
  { from: { address: 'pesquisa@intersaberes.com', name: 'Pesquisa' }, subject: 'Nova Edição - Caderno Intersaberes, edição v. 15, n. 56 (2026)', expected: 'primary' },
  { from: { address: 'noreply@prisma.io', name: 'Prisma' }, subject: 'Updates to our Terms of Service and SLA', expected: 'primary' },
  // Server-resolved category (Gmail X-GM-RAW) wins:
  { from: { address: 'noreply@mercadolivre.com.br', name: 'Mercado Livre' }, subject: 'Você tem uma nova mensagem', category: 'promotions', expected: 'promotions' },
  // No sender is special-cased: these follow the server-resolved Gmail
  // category like any other message, so the tabs mirror Gmail exactly.
  { from: { address: 'share@tailscale.com', name: 'Tailscale' }, subject: 'Anderson Tavares shared a device with you over Tailscale', category: 'updates', expected: 'updates' },
  { from: { address: 'noreply@mercadopago.com.br', name: 'Mercado Pago' }, subject: 'Seu crédito está te esperando no Mercado Pago', category: 'promotions', expected: 'promotions' },
  { from: { address: 'news@loja.com', name: '' }, subject: 'Oferta exclusiva', category: 'primary', expected: 'primary' },
  { from: { address: 'noreply@grupo.com', name: '' }, subject: 'Mensagem do grupo', category: 'forums', expected: 'updates' }
]

describe('email categories (Gmail-style)', () => {
  it('classifies senders the same way twice (UI copy)', () => {
    for (const c of CASES) {
      expect(classifyEmailCategory({ from: c.from, subject: c.subject, labels: c.labels, category: c.category })).toBe(c.expected)
    }
  })

  it('matches the worker copy on every case (no drift)', () => {
    for (const c of CASES) {
      expect(classifyWorker({ from: c.from, subject: c.subject, labels: c.labels, category: c.category })).toBe(
        classifyEmailCategory({ from: c.from, subject: c.subject, labels: c.labels, category: c.category })
      )
    }
  })

  it('notifies only Primary when primary-only mode is on', () => {
    expect(shouldNotifyForCategory('primary', true)).toBe(true)
    expect(shouldNotifyForCategory('promotions', true)).toBe(false)
    expect(shouldNotifyForCategory('social', true)).toBe(false)
    expect(shouldNotifyForCategory('updates', true)).toBe(false)
    expect(shouldNotifyWorker('promotions', true)).toBe(false)
  })

  it('notifies every category when primary-only mode is off', () => {
    for (const category of ['primary', 'promotions', 'social', 'updates'] as const) {
      expect(shouldNotifyForCategory(category, false)).toBe(true)
    }
  })

  it('counts loaded messages per category', () => {
    const messages = [
      { from: 'ana@empresa.com', subject: 'Reunião amanhã' },
      { from: 'news@loja.com', subject: 'Oferta exclusiva' },
      { from: 'noreply@facebook.com', subject: 'Nova mensagem' },
      { from: 'security@banco.com', subject: 'Seu código de acesso', labels: ['^smartlabel_notification'] }
    ]
    expect(countByCategory(messages)).toEqual({ primary: 1, promotions: 1, social: 1, updates: 1 })
    expect(countByCategory([])).toEqual({ primary: 0, promotions: 0, social: 0, updates: 0 })
  })
})
