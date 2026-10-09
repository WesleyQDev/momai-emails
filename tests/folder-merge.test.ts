import { describe, it, expect } from 'vitest'
import { mergeFolderMessages, sortMessagesNewestFirst } from '../src/services/prewarm'
import type { EmailMessage } from '../src/services/types'

function makeMessages(ids: string[]): EmailMessage[] {
  return ids.map((id) => ({ id, folder: 'INBOX', subject: `Subject ${id}` }) as EmailMessage)
}

function range(prefix: string, from: number, to: number): string[] {
  const ids: string[] = []
  for (let i = from; i <= to; i += 1) ids.push(`${prefix}${i}`)
  return ids
}

describe('folder cache merge', () => {
  it('never shrinks the cache when the incoming list is a smaller overlapping head', () => {
    const existing = makeMessages(range('m', 1, 80))
    const incoming = makeMessages(range('m', 1, 30))
    const merged = mergeFolderMessages(existing, incoming)
    expect(merged).toHaveLength(80)
    expect(merged.slice(0, 30).map((m) => m.id)).toEqual(range('m', 1, 30))
    expect(merged.map((m) => m.id)).toEqual(range('m', 1, 80))
  })

  it('prepends genuinely new messages ahead of the existing list', () => {
    const existing = makeMessages(range('m', 3, 80))
    const incoming = makeMessages(range('m', 1, 30))
    const merged = mergeFolderMessages(existing, incoming)
    expect(merged.slice(0, 3).map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])
    expect(merged).toHaveLength(80)
    expect(new Set(merged.map((m) => m.id)).size).toBe(80)
  })

  it('starts from the incoming list when nothing is cached', () => {
    const merged = mergeFolderMessages([], makeMessages(range('m', 1, 30)))
    expect(merged.map((m) => m.id)).toEqual(range('m', 1, 30))
  })

  it('never shrinks an accumulated list on refresh with the same head', () => {
    const existing = makeMessages(range('m', 1, 100))
    const incoming = makeMessages(range('m', 1, 80))
    const merged = mergeFolderMessages(existing, incoming, 500)
    expect(merged).toHaveLength(100)
    expect(merged.map((m) => m.id)).toEqual(range('m', 1, 100))
  })

  it('keeps the list unchanged when the refresh returns identical messages', () => {
    const existing = makeMessages(range('m', 1, 80))
    const incoming = makeMessages(range('m', 1, 80))
    const merged = mergeFolderMessages(existing, incoming, 500)
    expect(merged).toHaveLength(80)
    expect(new Set(merged.map((m) => m.id)).size).toBe(80)
  })

  it('caps the merged list at the storage limit', () => {
    const existing = makeMessages(range('m', 31, 200))
    const incoming = makeMessages(range('m', 1, 30))
    const merged = mergeFolderMessages(existing, incoming, 150)
    expect(merged).toHaveLength(150)
    expect(merged[0].id).toBe('m1')
  })
})

describe('sortMessagesNewestFirst', () => {
  function at(id: string, timestamp: number): EmailMessage {
    return { id, folder: 'INBOX', subject: `Subject ${id}`, timestamp } as EmailMessage
  }

  it('orders batches from different depths by recency, not arrival order', () => {
    // Category supplement batch (older) merged before the general window.
    const merged = [at('old1', 100), at('old2', 200), at('new1', 3000), at('new2', 4000)]
    expect(sortMessagesNewestFirst(merged).map((m) => m.id)).toEqual(['new2', 'new1', 'old2', 'old1'])
  })

  it('keeps the previous relative order for equal timestamps', () => {
    const merged = [at('a', 500), at('b', 500), at('c', 900)]
    expect(sortMessagesNewestFirst(merged).map((m) => m.id)).toEqual(['c', 'a', 'b'])
  })

  it('treats missing timestamps as oldest without dropping messages', () => {
    const merged = [at('missing', 0), at('dated', 10)]
    expect(sortMessagesNewestFirst(merged).map((m) => m.id)).toEqual(['dated', 'missing'])
  })
})
