import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'
import ContextMenu, { ContextMenuOption } from '../src/components/ContextMenu'

describe('ContextMenu component', () => {
  it('renders all menu options including icons and dividers', () => {
    const items: ContextMenuOption[] = [
      { id: 'reply', label: 'Responder', onClick: vi.fn() },
      { divider: true },
      { id: 'delete', label: 'Excluir', danger: true, onClick: vi.fn() }
    ]

    const markup = renderToStaticMarkup(
      createElement(ContextMenu, {
        x: 100,
        y: 150,
        items,
        onClose: vi.fn()
      })
    )

    expect(markup).toContain('Responder')
    expect(markup).toContain('Excluir')
    expect(markup).toContain('border-t')
  })

  it('renders menu item with submenu chevron and label', () => {
    const items: ContextMenuOption[] = [
      {
        id: 'move-to-tab',
        label: 'Mover para guia',
        children: [
          { id: 'tab-primary', label: 'Principal', onClick: vi.fn() },
          { id: 'tab-promotions', label: 'Promoções', onClick: vi.fn() }
        ]
      }
    ]

    const markup = renderToStaticMarkup(
      createElement(ContextMenu, {
        x: 100,
        y: 150,
        items,
        onClose: vi.fn()
      })
    )

    expect(markup).toContain('Mover para guia')
  })
})
