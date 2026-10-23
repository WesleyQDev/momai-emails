import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('momai:sdk', () => ({ default: {} }))

import { EmailComposer } from '../src/components/EmailComposer'

describe('EmailComposer body autocomplete', () => {
  beforeEach(() => {
    try {
      localStorage.clear()
    } catch {}
  })

  it('renders EmailComposer component and contains contenteditable editor', () => {
    const markup = renderToStaticMarkup(
      createElement(EmailComposer, {
        isOpen: true,
        accounts: [{ id: 'acc-1', email: 'me@example.com', name: 'Me' }],
        activeAccountId: 'acc-1',
        onClose: vi.fn(),
        onSend: vi.fn().mockResolvedValue({ ok: true })
      })
    )

    expect(markup).toContain('contentEditable="true"')
    expect(markup).toContain('Nova Mensagem')
  })
})
