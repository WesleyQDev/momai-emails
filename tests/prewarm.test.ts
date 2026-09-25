import { describe, it, expect, vi } from 'vitest'
import {
  getFolderPriorityWeight,
  sortFoldersForPrewarm,
  mergeFolderMessages,
  FolderPrewarmer
} from '../src/services/prewarm'
import type { EmailFolder, EmailMessage } from '../src/services/types'

describe('Folder pre-warming service', () => {
  it('assigns correct priority weights based on folder role and name', () => {
    expect(getFolderPriorityWeight({ path: 'INBOX', name: 'INBOX', role: 'inbox', unreadCount: 0, totalCount: 10 })).toBe(1)
    expect(getFolderPriorityWeight({ path: 'Sent', name: 'Sent Messages', role: 'sent', unreadCount: 0, totalCount: 10 })).toBe(2)
    expect(getFolderPriorityWeight({ path: 'Drafts', name: 'Drafts', role: 'drafts', unreadCount: 0, totalCount: 10 })).toBe(3)
    expect(getFolderPriorityWeight({ path: 'Spam', name: 'Junk', role: 'junk', unreadCount: 0, totalCount: 10 })).toBe(4)
    expect(getFolderPriorityWeight({ path: 'Trash', name: 'Trash', role: 'trash', unreadCount: 0, totalCount: 10 })).toBe(5)
    expect(getFolderPriorityWeight({ path: 'Archive', name: 'Archive', role: 'archive', unreadCount: 0, totalCount: 10 })).toBe(6)
    expect(getFolderPriorityWeight({ path: 'Projects', name: 'Projects', role: 'custom', unreadCount: 0, totalCount: 10 })).toBe(10)
  })

  it('sorts folders according to priority order for pre-warming', () => {
    const folders: EmailFolder[] = [
      { path: 'CustomFolder', name: 'CustomFolder', role: 'custom', unreadCount: 0, totalCount: 5 },
      { path: 'Trash', name: 'Trash', role: 'trash', unreadCount: 0, totalCount: 2 },
      { path: 'INBOX', name: 'INBOX', role: 'inbox', unreadCount: 0, totalCount: 100 },
      { path: 'Sent', name: 'Sent', role: 'sent', unreadCount: 0, totalCount: 20 },
      { path: 'Spam', name: 'Spam', role: 'junk', unreadCount: 0, totalCount: 0 }
    ]

    const sorted = sortFoldersForPrewarm(folders)
    expect(sorted.map((f) => f.path)).toEqual(['INBOX', 'Sent', 'Spam', 'Trash', 'CustomFolder'])
  })

  it('prewarms uncached folders sequentially and saves messages', async () => {
    const prewarmer = new FolderPrewarmer()
    const loadedFolders: string[] = []

    const folders: EmailFolder[] = [
      { path: 'INBOX', name: 'INBOX', role: 'inbox', unreadCount: 0, totalCount: 10 },
      { path: 'Sent', name: 'Sent', role: 'sent', unreadCount: 0, totalCount: 5 }
    ]

    const fakeFetch = vi.fn(async (folderPath: string) => {
      return { ok: true, messages: [{ id: '1', folder: folderPath, subject: 'Test' } as any] }
    })

    const cachedSet = new Set<string>()

    prewarmer.start({
      accountId: 'acc_1',
      folders,
      throttleMs: 10,
      isCached: (folderPath) => cachedSet.has(folderPath),
      fetchEmails: fakeFetch,
      onFolderLoaded: (folderPath, accId, messages) => {
        loadedFolders.push(folderPath)
        cachedSet.add(folderPath)
      }
    })

    await new Promise((r) => setTimeout(r, 60))

    expect(loadedFolders).toContain('INBOX')
    expect(loadedFolders).toContain('Sent')
    expect(fakeFetch).toHaveBeenCalledTimes(2)
  })

  it('stops immediately when cancelled or when account changes', async () => {
    const prewarmer = new FolderPrewarmer()
    const loadedFolders: string[] = []

    const folders: EmailFolder[] = [
      { path: 'INBOX', name: 'INBOX', role: 'inbox', unreadCount: 0, totalCount: 10 },
      { path: 'Sent', name: 'Sent', role: 'sent', unreadCount: 0, totalCount: 5 }
    ]

    const fakeFetch = vi.fn(async (folderPath: string) => {
      return { ok: true, messages: [] }
    })

    prewarmer.start({
      accountId: 'acc_1',
      folders,
      throttleMs: 50,
      isCached: () => false,
      fetchEmails: fakeFetch,
      onFolderLoaded: (folderPath) => {
        loadedFolders.push(folderPath)
      }
    })

    // Stop immediately before Sent is processed
    prewarmer.stop()
    await new Promise((r) => setTimeout(r, 80))

    expect(prewarmer.isActive()).toBe(false)
  })

  it('adds a moved message to the destination cache instantly without duplicates', () => {
    const existing = [
      { id: '1', folder: 'Archive', subject: 'First' },
      { id: '2', folder: 'Archive', subject: 'Second' }
    ] as any
    const moved = { id: '3', folder: 'Archive', subject: 'Moved' } as any
    const merged = mergeFolderMessages(existing, [moved])
    expect(merged.map((m: any) => m.id)).toEqual(['3', '1', '2'])

    const duplicate = mergeFolderMessages(merged, [moved])
    expect(duplicate.map((m: any) => m.id)).toEqual(['3', '1', '2'])
  })
})
