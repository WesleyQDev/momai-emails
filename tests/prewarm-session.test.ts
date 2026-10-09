import { describe, it, expect } from 'vitest'
import { FolderPrewarmer, type PrewarmTaskOptions } from '../src/services/prewarm'
import type { EmailFolder } from '../src/services/types'

const FOLDERS: EmailFolder[] = [
  { path: 'INBOX', name: 'INBOX', role: 'inbox', unreadCount: 0, totalCount: 10 },
  { path: 'Sent', name: 'Sent', role: 'sent', unreadCount: 0, totalCount: 5 }
]

const CUSTOM_FOLDER: EmailFolder = {
  path: 'Projects',
  name: 'Projects',
  role: 'custom',
  unreadCount: 0,
  totalCount: 3
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('FolderPrewarmer session queue', () => {
  it('appends newly discovered folders without cancelling the running queue', async () => {
    const prewarmer = new FolderPrewarmer()
    const fetched: string[] = []
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const base: PrewarmTaskOptions = {
      accountId: 'acc_1',
      folders: FOLDERS,
      isCached: () => false,
      fetchEmails: async (folderPath: string) => {
        fetched.push(folderPath)
        if (folderPath === 'INBOX') await gate
        return { ok: true, messages: [] }
      },
      onFolderLoaded: () => {},
      throttleMs: 0
    }

    prewarmer.start(base)
    // Same account while running: must merge, not restart (no duplicate INBOX).
    prewarmer.start({ ...base, folders: [...FOLDERS, CUSTOM_FOLDER] })
    release()
    await wait(30)

    expect(fetched).toEqual(['INBOX', 'Sent', 'Projects'])
    expect(prewarmer.isActive()).toBe(false)
  })

  it('retries a failed folder a bounded number of times and drops it', async () => {
    const prewarmer = new FolderPrewarmer()
    let calls = 0

    prewarmer.start({
      accountId: 'acc_1',
      folders: [FOLDERS[0]],
      isCached: () => false,
      fetchEmails: async () => {
        calls += 1
        throw new Error('offline')
      },
      onFolderLoaded: () => {},
      throttleMs: 0,
      maxAttempts: 2
    })

    await wait(40)
    expect(calls).toBe(2)
    expect(prewarmer.isActive()).toBe(false)
  })

  it('re-attempts a dropped folder on a later start', async () => {
    const prewarmer = new FolderPrewarmer()
    let calls = 0
    const options: PrewarmTaskOptions = {
      accountId: 'acc_1',
      folders: [FOLDERS[0]],
      isCached: () => false,
      fetchEmails: async () => {
        calls += 1
        return calls < 3 ? { ok: false } : { ok: true, messages: [] }
      },
      onFolderLoaded: () => {},
      throttleMs: 0,
      maxAttempts: 2
    }

    prewarmer.start(options)
    await wait(30)
    expect(calls).toBe(2)

    prewarmer.start(options)
    await wait(20)
    expect(calls).toBe(3)
  })

  it('cancels the previous account queue when the account changes', async () => {
    const prewarmer = new FolderPrewarmer()
    const fetched: Array<{ acc: string; path: string }> = []
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const optionsFor = (accountId: string): PrewarmTaskOptions => ({
      accountId,
      folders: FOLDERS,
      isCached: () => false,
      fetchEmails: async (folderPath: string) => {
        fetched.push({ acc: accountId, path: folderPath })
        if (accountId === 'acc_a' && folderPath === 'INBOX') await gate
        return { ok: true, messages: [] }
      },
      onFolderLoaded: () => {},
      throttleMs: 0
    })

    prewarmer.start(optionsFor('acc_a'))
    prewarmer.start(optionsFor('acc_b'))
    release()
    await wait(30)

    expect(fetched.filter((entry) => entry.acc === 'acc_a')).toEqual([{ acc: 'acc_a', path: 'INBOX' }])
    expect(fetched).toContainEqual({ acc: 'acc_b', path: 'INBOX' })
    expect(fetched).toContainEqual({ acc: 'acc_b', path: 'Sent' })
  })

  it('stops immediately and clears queued work', async () => {
    const prewarmer = new FolderPrewarmer()
    const fetched: string[] = []

    prewarmer.start({
      accountId: 'acc_1',
      folders: FOLDERS,
      isCached: () => false,
      fetchEmails: async (folderPath: string) => {
        fetched.push(folderPath)
        return { ok: true, messages: [] }
      },
      onFolderLoaded: () => {},
      throttleMs: 50
    })

    prewarmer.stop()
    await wait(80)
    expect(prewarmer.isActive()).toBe(false)
    expect(fetched.length).toBeLessThanOrEqual(1)
  })
})
