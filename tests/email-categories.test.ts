import { describe, it, expect } from 'vitest'
import { classifyEmailCategory, shouldNotifyForCategory } from '../src/services/email-categories'
import { classifyEmailCategory as classifyWorker, shouldNotifyForCategory as shouldNotifyWorker } from '../email-categories'

const CASES: Array<{ from: any; subject: string; expected: string }> = [
  { from: { address: 'ana@empresa.com', name: 'Ana' }, subject: 'Reunião amanhã', expected: 'primary' },
  { from: { address: 'news@loja.com', name: '' }, subject: 'Oferta exclusiva', expected: 'promotions' },
  { from: { address: 'newsletter@site.com', name: '' }, subject: 'Novidades da semana', expected: 'promotions' },
  { from: { address: 'noreply@facebook.com', name: '' }, subject: 'Nova mensagem', expected: 'social' },
  { from: { address: 'alerts@github.com', name: '' }, subject: 'PR merged', expected: 'social' },
  { from: { address: 'security@banco.com', name: '' }, subject: 'Seu código de acesso', expected: 'updates' },
  { from: { address: 'contato@noreply-shop.com', name: '' }, subject: 'Cupom de desconto', expected: 'promotions' },
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
})
