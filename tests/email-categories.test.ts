import { describe, it, expect } from 'vitest'
import { classifyEmailCategory, shouldNotifyForCategory, countByCategory } from '../src/services/email-categories'
import { classifyEmailCategory as classifyWorker, shouldNotifyForCategory as shouldNotifyWorker } from '../email-categories'

const CASES: Array<{ from: any; subject: string; expected: string }> = [
  { from: { address: 'ana@empresa.com', name: 'Ana' }, subject: 'Reunião amanhã', expected: 'primary' },
  { from: { address: 'news@loja.com', name: '' }, subject: 'Oferta exclusiva', expected: 'promotions' },
  { from: { address: 'newsletter@site.com', name: '' }, subject: 'Novidades da semana', expected: 'promotions' },
  { from: { address: 'noreply@facebook.com', name: '' }, subject: 'Nova mensagem', expected: 'social' },
  { from: { address: 'inmail-hit-reply@linkedin.com', name: '' }, subject: 'Nova mensagem de recrutador', expected: 'social' },
  { from: { address: 'alerts@github.com', name: '' }, subject: 'PR merged', expected: 'updates' },
  { from: { address: 'noreply@github.com', name: '' }, subject: 'Your Copilot report is ready', expected: 'updates' },
  { from: { address: 'copilot@github.com', name: '' }, subject: 'Copilot usage summary', expected: 'updates' },
  { from: { address: 'security@banco.com', name: '' }, subject: 'Seu código de acesso', expected: 'updates' },
  { from: { address: 'contato@noreply-shop.com', name: '' }, subject: 'Cupom de desconto', expected: 'promotions' },
  { from: { address: 'calendar-notification@google.com', name: '' }, subject: 'Convite: Reunião de equipe', expected: 'primary' },
  { from: { address: 'events-noreply@google.com', name: '' }, subject: 'Detalhes do seu evento', expected: 'primary' },
  { from: 'joao@email.com', subject: 'Oi', expected: 'primary' }
]

describe('email categories (Gmail-style)', () => {
  it('classifies senders the same way twice (UI copy)', () => {
    for (const c of CASES) {
      expect(classifyEmailCategory({ from: c.from, subject: c.subject })).toBe(c.expected)
    }
  })

  it('matches the worker copy on every case (no drift)', () => {
    for (const c of CASES) {
      expect(classifyWorker({ from: c.from, subject: c.subject })).toBe(
        classifyEmailCategory({ from: c.from, subject: c.subject })
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
      { from: 'security@banco.com', subject: 'Seu código de acesso' }
    ]
    expect(countByCategory(messages)).toEqual({ primary: 1, promotions: 1, social: 1, updates: 1 })
    expect(countByCategory([])).toEqual({ primary: 0, promotions: 0, social: 0, updates: 0 })
  })
})
