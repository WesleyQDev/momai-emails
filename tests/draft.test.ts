import { describe, it, expect, vi } from 'vitest'
import {
  hasDraftContent,
  stripHtmlToText,
  closeAndSaveDraftInBackground,
  buildPendingDraft,
  removePendingDrafts,
  rememberDraftMessage,
  forgetDraftMessage,
  isKnownDraftMessage
} from '../src/services/draft'

describe('draft content guard (close saves, empty does not)', () => {
  it('treats a fully empty composer as no draft', () => {
    expect(
      hasDraftContent({ to: '', cc: '', bcc: '', subject: '', body: '', attachments: [] })
    ).toBe(false)
  })

  it('treats whitespace-only HTML body as empty', () => {
    expect(
      hasDraftContent({ to: '', subject: '', body: '<div><br></div><p>&nbsp; </p>', attachments: [] })
    ).toBe(false)
  })

  it('detects typed body text as draft content (repro: close must save)', () => {
    expect(
      hasDraftContent({ to: '', subject: '', body: '<div>Olá, segue o relatório</div>', attachments: [] })
    ).toBe(true)
  })

  it('detects recipient or subject alone as draft content', () => {
    expect(hasDraftContent({ to: 'a@b.com', subject: '', body: '', attachments: [] })).toBe(true)
    expect(hasDraftContent({ to: '', subject: 'Oi', body: '', attachments: [] })).toBe(true)
  })

  it('detects attachments as draft content even with empty body', () => {
    expect(
      hasDraftContent({
        to: '',
        subject: '',
        body: '',
        attachments: [{ id: '1', filename: 'a.png', contentType: 'image/png', size: 10 }]
      })
    ).toBe(true)
  })

  it('strips HTML tags and entities to plain text', () => {
    expect(stripHtmlToText('<p>Olá <b>mundo</b>&nbsp;</p>')).toBe('Olá mundo')
    expect(stripHtmlToText('')).toBe('')
  })
})

describe('background draft save (close is immediate)', () => {
  it('closes synchronously without waiting for the save to finish', async () => {
    let resolveSave!: () => void
    const gate = new Promise<void>((resolve) => {
      resolveSave = resolve
    })
    const events: string[] = []
    const started = closeAndSaveDraftInBackground(
      { to: '', subject: '', body: 'hello' },
      () => {
        events.push('close')
      },
      () => {
        events.push('save')
        return gate
      }
    )
    expect(started).toBe(true)
    expect(events).toEqual(['close', 'save'])
    resolveSave()
    await gate
    await Promise.resolve()
    expect(events).toEqual(['close', 'save'])
  })

  it('just closes without saving when there is no content', () => {
    const onSaveDraft = vi.fn(() => Promise.resolve({ ok: true }))
    const onClose = vi.fn()
    const started = closeAndSaveDraftInBackground(
      { to: '', subject: '', body: '<div><br></div>', attachments: [] },
      onClose,
      onSaveDraft
    )
    expect(started).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSaveDraft).not.toHaveBeenCalled()
  })

  it('reports a background save failure without reopening the composer', async () => {
    const onError = vi.fn()
    const onClose = vi.fn()
    const started = closeAndSaveDraftInBackground(
      { to: '', subject: '', body: 'hello' },
      onClose,
      () => Promise.reject(new Error('offline')),
      onError
    )
    expect(started).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('pending draft (instant appearance)', () => {
  it('builds a list-ready message from the composer payload', () => {
    const pending = buildPendingDraft({
      to: 'a@b.com, c@d.com',
      subject: 'Oi',
      body: '<div>Olá, segue o <b>relatório</b></div>',
      accountEmail: 'me@x.com',
      draftsFolder: 'Drafts'
    })
    expect(pending.id.startsWith('pending-draft-')).toBe(true)
    expect(pending.folder).toBe('Drafts')
    expect(pending.subject).toBe('Oi')
    expect(pending.snippet).toBe('Olá, segue o relatório')
    expect(pending.from.address).toBe('me@x.com')
    expect(pending.to.map((t) => t.address)).toEqual(['a@b.com', 'c@d.com'])
  })

  it('removes only the pending items once the server list arrives', () => {
    const pending = buildPendingDraft({ to: '', subject: 'Oi', body: 'hi', accountEmail: 'm@x.com', draftsFolder: 'Drafts' })
    const real = { ...pending, id: '123', uid: 123, messageId: 'm123' }
    expect(removePendingDrafts([pending, real], [pending.id])).toEqual([real])
    expect(removePendingDrafts([real], [pending.id])).toEqual([real])
  })
})

describe('known drafts ledger (trashed drafts keep the badge)', () => {
  it('remembers a trashed draft by message id and forgets it on demand', () => {
    expect(isKnownDraftMessage('acc1', '<abc@mail>')).toBe(false)
    rememberDraftMessage('acc1', '<abc@mail>')
    expect(isKnownDraftMessage('acc1', '<abc@mail>')).toBe(true)
    forgetDraftMessage('acc1', '<abc@mail>')
    expect(isKnownDraftMessage('acc1', '<abc@mail>')).toBe(false)
  })

  it('isolates ledgers per account and ignores empty ids', () => {
    rememberDraftMessage('acc1', '<xyz@mail>')
    expect(isKnownDraftMessage('acc2', '<xyz@mail>')).toBe(false)
    expect(isKnownDraftMessage('acc1', '')).toBe(false)
    rememberDraftMessage('acc1', '')
    expect(isKnownDraftMessage('acc1', '')).toBe(false)
    forgetDraftMessage('acc1', '<xyz@mail>')
  })
})
