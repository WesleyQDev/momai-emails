import { describe, it, expect } from 'vitest'
import { isDraftsFolder, resolveDraftsPath } from '../src/services/folders'

const { saveDraft, findDraftsFolderInList } = require('../email-client.ts')

function makeFolder(path: string, role?: any) {
  return { path, name: path, role, unreadCount: 0, totalCount: 0 }
}

describe('save draft backend guard', () => {
  it('rejects empty drafts without creating anything', async () => {
    const account = { id: 'a1', email: 'a@b.com' }
    await expect(saveDraft(account, { to: '', subject: '', body: '', attachments: [] })).resolves.toMatchObject({
      ok: false
    })
    await expect(
      saveDraft(account, { to: ' ', subject: '  ', body: '<div><br>&nbsp;</div>', attachments: [] })
    ).resolves.toMatchObject({ ok: false })
  })

  it('detects the drafts folder by role and by name', () => {
    expect(isDraftsFolder('anything', 'drafts')).toBe(true)
    expect(isDraftsFolder('Drafts')).toBe(true)
    expect(isDraftsFolder('Rascunhos')).toBe(true)
    expect(isDraftsFolder('[Gmail]/Rascunhos')).toBe(true)
    expect(isDraftsFolder('INBOX', 'inbox')).toBe(false)
    const folders = [makeFolder('INBOX', 'inbox'), makeFolder('[Gmail]/Rascunhos', 'drafts')]
    expect(resolveDraftsPath(folders as any)).toBe('[Gmail]/Rascunhos')
    expect(resolveDraftsPath([makeFolder('INBOX', 'inbox')] as any)).toBe('Drafts')
  })

  it('finds the drafts path in a cached folder list without a server roundtrip', () => {
    expect(findDraftsFolderInList([{ path: 'INBOX', role: 'inbox' }])).toBeNull()
    expect(findDraftsFolderInList([{ path: '[Gmail]/Rascunhos', role: 'drafts' }])).toBe('[Gmail]/Rascunhos')
    expect(findDraftsFolderInList([{ path: 'Drafts', specialUse: '\\Drafts' }])).toBe('Drafts')
    expect(findDraftsFolderInList([{ path: 'Rascunhos', name: 'Rascunhos' }])).toBe('Rascunhos')
    expect(findDraftsFolderInList([])).toBeNull()
    expect(findDraftsFolderInList(null)).toBeNull()
  })
})
