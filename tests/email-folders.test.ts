import { describe, it, expect } from 'vitest'
import {
  dedupeFoldersByRole,
  isArchiveFolder,
  isDraftMessage,
  isSpamFolder,
  isTrashFolder,
  isInboxFolder,
  isStarredFolder,
  isVirtualStarredFolder,
  ensureStarredFolder,
  getStarredMessages,
  resolveArchivePath,
  resolveInboxPath,
  getMoveTargets,
  getDefaultFolders,
  sortFoldersByStandardOrder,
  mergeWithDefaultFolders
} from '../src/services/folders'
import type { EmailFolder, EmailMessage } from '../src/services/types'

function makeFolder(path: string, role?: EmailFolder['role']): EmailFolder {
  return { path, name: path, role, unreadCount: 0, totalCount: 0 }
}

function makeMessage(id: string, starred: boolean, timestamp: number, folder = 'INBOX'): EmailMessage {
  return {
    id,
    uid: Number(id) || 1,
    messageId: `msg-${id}`,
    folder,
    subject: `Subject ${id}`,
    from: { name: '', address: 'sender@example.com' },
    to: [],
    date: new Date(timestamp).toISOString(),
    timestamp,
    read: true,
    starred,
    snippet: ''
  }
}

describe('email folders (spam / inbox / move)', () => {
  it('detects spam folders by path and role', () => {
    expect(isSpamFolder('INBOXSpam', 'junk')).toBe(true)
    expect(isSpamFolder('Spam')).toBe(true)
    expect(isSpamFolder('[Gmail]/Spam')).toBe(true)
    expect(isSpamFolder('Junk')).toBe(true)
    expect(isSpamFolder('INBOX')).toBe(false)
    expect(isSpamFolder('INBOX', 'inbox')).toBe(false)
  })

  it('detects the main inbox folder', () => {
    expect(isInboxFolder('INBOX', 'inbox')).toBe(true)
    expect(isInboxFolder('inbox')).toBe(true)
    expect(isInboxFolder('INBOX')).toBe(true)
    expect(isInboxFolder('Spam', 'junk')).toBe(false)
    expect(isInboxFolder('Sent')).toBe(false)
  })

  it('resolves the inbox destination for not-spam moves', () => {
    const folders = [
      makeFolder('INBOX', 'inbox'),
      makeFolder('Spam', 'junk'),
      makeFolder('Sent', 'sent')
    ]
    expect(resolveInboxPath(folders)).toBe('INBOX')
    expect(resolveInboxPath([])).toBe('INBOX')
    expect(resolveInboxPath([], 'INBOX')).toBe('INBOX')
  })

  it('lists move targets excluding the current folder', () => {
    const folders = [
      makeFolder('INBOX', 'inbox'),
      makeFolder('Spam', 'junk'),
      makeFolder('Sent', 'sent')
    ]
    const targets = getMoveTargets(folders, 'INBOX')
    expect(targets.map((f) => f.path)).toEqual(['Spam', 'Sent'])
    expect(getMoveTargets(folders, 'Spam').map((f) => f.path)).toEqual(['INBOX', 'Sent'])
  })

  it('detects the favorites folder by path and role', () => {
    expect(isStarredFolder('starred', 'starred')).toBe(true)
    expect(isStarredFolder('starred')).toBe(true)
    expect(isStarredFolder('[Gmail]/Starred')).toBe(true)
    expect(isStarredFolder('INBOX', 'inbox')).toBe(false)
    expect(isStarredFolder('INBOX')).toBe(false)
    expect(isStarredFolder('Spam', 'junk')).toBe(false)
  })

  it('appends a virtual favorites folder only when the server has none', () => {
    const withoutStarred = [makeFolder('INBOX', 'inbox'), makeFolder('Sent', 'sent')]
    const ensured = ensureStarredFolder(withoutStarred)
    expect(ensured.map((f) => f.path)).toEqual(['INBOX', 'Sent', 'starred'])
    expect(ensured.find((f) => f.path === 'starred')?.role).toBe('starred')
    expect(withoutStarred).toHaveLength(2)

    const withStarred = [makeFolder('INBOX', 'inbox'), makeFolder('[Gmail]/Starred', 'starred')]
    expect(ensureStarredFolder(withStarred)).toHaveLength(2)
  })

  it('aggregates only starred messages, newest first', () => {
    const messages = [
      makeMessage('1', false, 1000),
      makeMessage('2', true, 3000, 'Sent'),
      makeMessage('3', true, 2000)
    ]
    const starred = getStarredMessages(messages)
    expect(starred.map((m) => m.id)).toEqual(['2', '3'])
  })

  it('treats the favorites view as virtual only without a server starred mailbox', () => {
    const withoutStarred = [makeFolder('INBOX', 'inbox')]
    expect(isVirtualStarredFolder('starred', withoutStarred)).toBe(true)
    expect(isVirtualStarredFolder('INBOX', withoutStarred)).toBe(false)

    const withStarred = [makeFolder('INBOX', 'inbox'), makeFolder('[Gmail]/Starred', 'starred')]
    expect(isVirtualStarredFolder('[Gmail]/Starred', withStarred)).toBe(false)
    expect(isVirtualStarredFolder('INBOX', withStarred)).toBe(false)
  })

  it('merges duplicated system folders into a single entry', () => {
    const folders: EmailFolder[] = [
      { ...makeFolder('[Gmail]/Drafts', 'drafts'), totalCount: 2 },
      { ...makeFolder('Rascunhos', 'drafts'), totalCount: 9 },
      makeFolder('INBOX', 'inbox'),
      makeFolder('Projects', 'custom'),
      makeFolder('Receipts', 'custom')
    ]
    const deduped = dedupeFoldersByRole(folders)
    expect(deduped.map((f) => f.path)).toEqual(['Rascunhos', 'INBOX', 'Projects', 'Receipts'])
    expect(deduped).toHaveLength(4)
    expect(folders).toHaveLength(5)
  })

  it('keeps custom folders untouched', () => {
    const folders = [makeFolder('Projects', 'custom'), makeFolder('Receipts', 'custom')]
    expect(dedupeFoldersByRole(folders)).toHaveLength(2)
  })

  it('returns standard fixed default folders immediately', () => {
    const defaults = getDefaultFolders()
    expect(defaults.map((f) => f.role)).toEqual([
      'inbox',
      'archive',
      'junk',
      'drafts',
      'sent',
      'trash',
      'starred'
    ])
    expect(defaults).toHaveLength(7)
  })

  it('sorts folders according to the standard order', () => {
    const mixed: EmailFolder[] = [
      makeFolder('Trash', 'trash'),
      makeFolder('Sent', 'sent'),
      makeFolder('INBOX', 'inbox'),
      makeFolder('Archive', 'archive'),
      makeFolder('Junk', 'junk'),
      makeFolder('Drafts', 'drafts'),
      makeFolder('starred', 'starred')
    ]
    const sorted = sortFoldersByStandardOrder(mixed)
    expect(sorted.map((f) => f.role)).toEqual([
      'inbox',
      'archive',
      'junk',
      'drafts',
      'sent',
      'trash',
      'starred'
    ])
  })

  it('merges server folders while ensuring all standard folders exist and are ordered', () => {
    const serverFolders = [
      makeFolder('INBOX', 'inbox'),
      makeFolder('Sent', 'sent'),
      makeFolder('CustomFolder', 'custom')
    ]
    const merged = mergeWithDefaultFolders(serverFolders)
    expect(merged.map((f) => f.role)).toEqual([
      'inbox',
      'archive',
      'junk',
      'drafts',
      'sent',
      'trash',
      'starred',
      'custom'
    ])
  })

  it('detects the archive folder by path and role only', () => {
    expect(isArchiveFolder('Archive', 'archive')).toBe(true)
    expect(isArchiveFolder('Arquivo', 'custom')).toBe(true)
    expect(isArchiveFolder('[Gmail]/All Mail', 'custom')).toBe(false)
    expect(isArchiveFolder('Todos os E-mails', 'custom')).toBe(false)
    expect(isArchiveFolder('INBOX', 'inbox')).toBe(false)
    expect(isArchiveFolder('Sent', 'sent')).toBe(false)
  })

  it('resolves the real archive path instead of a missing static fallback', () => {
    const folders = [
      makeFolder('INBOX', 'inbox'),
      makeFolder('Arquivo', 'archive'),
      makeFolder('Sent', 'sent')
    ]
    expect(resolveArchivePath(folders)).toBe('Arquivo')

    const withoutArchive = [makeFolder('INBOX', 'inbox'), makeFolder('Sent', 'sent')]
    expect(resolveArchivePath(withoutArchive)).toBe('Archive')
  })

  it('reuses the server archive folder instead of injecting a duplicate', () => {
    const serverFolders = [
      makeFolder('INBOX', 'inbox'),
      makeFolder('Arquivo', 'archive'),
      makeFolder('Sent', 'sent')
    ]
    const merged = mergeWithDefaultFolders(serverFolders)
    const archives = merged.filter((f) => f.role === 'archive')
    expect(archives).toHaveLength(1)
    expect(archives[0].path).toBe('Arquivo')
  })
})

describe('draft message badge (drafts folder or trash)', () => {
  const folders = [makeFolder('INBOX', 'inbox'), makeFolder('[Gmail]/Rascunhos', 'drafts'), makeFolder('Trash', 'trash')]

  function makeDraftMsg(overrides: Partial<EmailMessage> = {}): EmailMessage {
    return { ...makeMessage('1', true, Date.now(), 'Drafts'), ...overrides }
  }

  it('marks messages inside the drafts folder', () => {
    expect(isDraftMessage(makeDraftMsg({ folder: '[Gmail]/Rascunhos' }), folders)).toBe(true)
  })

  it('marks drafts by name even without a folder list', () => {
    expect(isDraftMessage(makeDraftMsg({ folder: 'Rascunhos' }), [])).toBe(true)
    expect(isDraftMessage(makeDraftMsg({ folder: 'Drafts' }))).toBe(true)
  })

  it('marks drafts carrying the server draft flag (e.g. inside trash)', () => {
    expect(isDraftMessage(makeDraftMsg({ folder: 'Trash', draft: true }), folders)).toBe(true)
  })

  it('does not mark regular inbox or trash messages', () => {
    expect(isDraftMessage(makeMessage('2', true, Date.now(), 'INBOX'), folders)).toBe(false)
    expect(isDraftMessage(makeMessage('3', true, Date.now(), 'Trash'), folders)).toBe(false)
    expect(isDraftMessage(null, folders)).toBe(false)
  })

  it('detects trash folders by path and role', () => {
    expect(isTrashFolder('Trash', 'trash')).toBe(true)
    expect(isTrashFolder('[Gmail]/Lixeira')).toBe(true)
    expect(isTrashFolder('Lixeira')).toBe(true)
    expect(isTrashFolder('INBOX', 'inbox')).toBe(false)
    expect(isTrashFolder('Drafts', 'drafts')).toBe(false)
  })
})
