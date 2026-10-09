import { describe, expect, it, vi } from 'vitest'
import {
  mapGmailCategoryToUi,
  normalizeGmailCategory,
  resolveGmailCategories,
  applyGmailCategories,
  listCategoryMessages
} from '../email-client'

function fakeGmailClient(byCategory: Record<string, number[]>, options: { capable?: boolean; fail?: boolean } = {}) {
  const capable = options.capable !== false
  return {
    capabilities: new Map(capable ? [['X-GM-EXT-1', true]] : []),
    search: vi.fn(async (criteria: any) => {
      if (options.fail) throw new Error('search failed')
      const match = /^category:(.+)$/.exec(String(criteria?.gmraw || ''))
      return match ? byCategory[match[1]] || [] : []
    })
  }
}

describe('mapGmailCategoryToUi', () => {
  it('maps Gmail categories onto the four inbox tabs', () => {
    expect(mapGmailCategoryToUi('primary')).toBe('primary')
    expect(mapGmailCategoryToUi('personal')).toBe('primary')
    expect(mapGmailCategoryToUi('promotions')).toBe('promotions')
    expect(mapGmailCategoryToUi('social')).toBe('social')
    expect(mapGmailCategoryToUi('updates')).toBe('updates')
    expect(mapGmailCategoryToUi('forums')).toBe('updates')
    expect(mapGmailCategoryToUi('unknown')).toBeNull()
  })
})

describe('normalizeGmailCategory', () => {
  it('accepts the Gmail search names and the personal alias', () => {
    expect(normalizeGmailCategory('primary')).toBe('primary')
    expect(normalizeGmailCategory('personal')).toBe('primary')
    expect(normalizeGmailCategory('PROMOTIONS')).toBe('promotions')
    expect(normalizeGmailCategory(' social ')).toBe('social')
    expect(normalizeGmailCategory('forums')).toBe('forums')
  })

  it('rejects unknown or empty values so listing falls back to the normal path', () => {
    expect(normalizeGmailCategory('inbox')).toBeNull()
    expect(normalizeGmailCategory('')).toBeNull()
    expect(normalizeGmailCategory(null)).toBeNull()
    expect(normalizeGmailCategory(undefined)).toBeNull()
  })
})

describe('resolveGmailCategories', () => {
  it('queries every category bucket in a single roundtrip', async () => {
    const client = fakeGmailClient({ promotions: [11], social: [13], updates: [14], forums: [] })
    const map = await resolveGmailCategories(client, [11, 12, 13, 14])

    expect(map?.get(11)).toBe('promotions')
    expect(map?.get(12)).toBe('primary')
    expect(map?.get(13)).toBe('social')
    expect(map?.get(14)).toBe('updates')
    expect(client.search).toHaveBeenCalledTimes(4)
    for (const bucket of ['promotions', 'social', 'updates', 'forums']) {
      expect(client.search).toHaveBeenCalledWith(
        expect.objectContaining({ uid: '11:14', gmraw: `category:${bucket}` }),
        { uid: true }
      )
    }
  })

  it('returns null for accounts without the Gmail extension', async () => {
    const client = fakeGmailClient({}, { capable: false })
    expect(await resolveGmailCategories(client, [11])).toBeNull()
    expect(client.search).not.toHaveBeenCalled()
  })

  it('returns null when the server search fails, so listing still works', async () => {
    const client = fakeGmailClient({}, { fail: true })
    expect(await resolveGmailCategories(client, [11])).toBeNull()
  })

  it('does nothing without UIDs', async () => {
    expect(await resolveGmailCategories(fakeGmailClient({}), [])).toBeNull()
  })
})

describe('applyGmailCategories', () => {
  it('annotates messages only when enabled', async () => {
    const client = fakeGmailClient({ promotions: [21] })
    const messages = [{ uid: 21 }, { uid: 22 }]

    await applyGmailCategories(client, messages, false)
    expect(messages.every((message) => !('category' in message))).toBe(true)

    await applyGmailCategories(client, messages, true)
    expect(messages[0]).toMatchObject({ uid: 21, category: 'promotions' })
    expect(messages[1]).toMatchObject({ uid: 22, category: 'primary' })
  })
})

function fakeCategoryClient(uids: number[], options: { capable?: boolean; fail?: boolean } = {}) {
  const capable = options.capable !== false
  return {
    capabilities: new Map(capable ? [['X-GM-EXT-1', true]] : []),
    search: vi.fn(async () => {
      if (options.fail) throw new Error('search failed')
      return uids.slice()
    }),
    fetch: vi.fn(async function* (range: string) {
      for (const uid of String(range).split(',').map(Number)) {
        yield {
          uid,
          seq: uid,
          envelope: {
            subject: `Subject ${uid}`,
            from: [{ name: `Sender ${uid}`, address: `sender${uid}@example.com` }],
            to: [],
            date: new Date(Date.UTC(2026, 0, uid))
          },
          flags: new Set(['\\Seen']),
          bodyStructure: {},
          labels: new Set(['\\Inbox'])
        }
      }
    })
  }
}

describe('listCategoryMessages', () => {
  it('lists the newest messages of the category with paging', async () => {
    const client = fakeCategoryClient([1, 5, 9, 12])
    const account = { id: 'acc1', email: 'user@gmail.com' }

    const first = await listCategoryMessages(client, account, 'INBOX', 'primary', 2, 0)
    expect(first?.messages.map((m: any) => m.uid)).toEqual([12, 9])
    expect(first?.hasMore).toBe(true)
    expect(first?.total).toBe(4)
    expect(first?.messages.every((m: any) => m.category === 'primary')).toBe(true)
    expect(client.search).toHaveBeenCalledWith({ gmraw: 'category:primary' }, { uid: true })

    const second = await listCategoryMessages(client, account, 'INBOX', 'primary', 2, 2)
    expect(second?.messages.map((m: any) => m.uid)).toEqual([5, 1])
    expect(second?.hasMore).toBe(false)
  })

  it('returns null for accounts without the Gmail extension', async () => {
    const client = fakeCategoryClient([1], { capable: false })
    expect(await listCategoryMessages(client, { id: 'a' }, 'INBOX', 'primary', 2, 0)).toBeNull()
    expect(client.search).not.toHaveBeenCalled()
  })

  it('returns null when the search fails so callers fall back to normal listing', async () => {
    const client = fakeCategoryClient([1], { fail: true })
    expect(await listCategoryMessages(client, { id: 'a' }, 'INBOX', 'primary', 2, 0)).toBeNull()
  })

  it('returns an empty page for a category with no messages', async () => {
    const client = fakeCategoryClient([])
    expect(await listCategoryMessages(client, { id: 'a' }, 'INBOX', 'primary', 30, 0)).toEqual({
      messages: [],
      hasMore: false,
      total: 0
    })
  })
})
