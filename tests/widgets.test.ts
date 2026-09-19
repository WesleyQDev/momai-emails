import { describe, expect, it } from 'vitest'
import manifest from '../manifest.json'

describe('emails widgets manifest', () => {
  it('declares unread widget for the gallery', () => {
    const widgets = (manifest as any)?.ui?.widgets ?? []
    const types = widgets.map((w: any) => w.type)
    expect(types).toContain('momai-emails-unread-widget')
  })

  it('declares gallery setup pointing at list_accounts', () => {
    const widgets = (manifest as any)?.ui?.widgets ?? []
    const unread = widgets.find((w: any) => w.type === 'momai-emails-unread-widget')
    expect(unread?.setup?.mode).toBe('single')
    expect(unread?.setup?.optionsTool).toBe('list_accounts')
    expect(unread?.setup?.configField).toBe('accountId')
  })
})
