import { describe, it, expect } from 'vitest'
import { BodyPrefetcher } from '../src/services/body-prefetch'
import type { EmailMessage } from '../src/services/types'

function makeMessage(id: string, folder = 'INBOX'): EmailMessage {
  return {
    id,
    uid: Number(id) || 0,
    messageId: `<${id}@example.com>`,
    folder,
    subject: `Subject ${id}`,
    from: { name: 'Sender', address: 'sender@example.com' },
    to: [{ name: 'Me', address: 'me@example.com' }],
    date: new Date().toISOString(),
    timestamp: Date.now(),
    read: false,
    starred: false,
    snippet: ''
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('BodyPrefetcher', () => {
  it('fetches queued bodies sequentially and reports them loaded', async () => {
    const prefetcher = new BodyPrefetcher()
    const fetched: string[] = []
    const loaded: string[] = []

    prefetcher.configure({
      isCached: () => false,
      fetchBody: async (message) => {
        fetched.push(message.id)
        return { ok: true, email: { ...message, text: 'body' } }
      },
      onBodyLoaded: (_accountId, message) => {
        loaded.push(message.id)
      },
      throttleMs: 0
    })

    prefetcher.enqueue('acc_1', [makeMessage('1'), makeMessage('2')])
    await wait(20)

    expect(fetched).toEqual(['1', '2'])
    expect(loaded).toEqual(['1', '2'])
  })

  it('skips messages that are already cached', async () => {
    const prefetcher = new BodyPrefetcher()
    const fetched: string[] = []

    prefetcher.configure({
      isCached: (_accountId, messageId) => messageId === '1',
      fetchBody: async (message) => {
        fetched.push(message.id)
        return { ok: true, email: message }
      },
      onBodyLoaded: () => {},
      throttleMs: 0
    })

    prefetcher.enqueue('acc_1', [makeMessage('1'), makeMessage('2')])
    await wait(20)

    expect(fetched).toEqual(['2'])
  })

  it('processes urgent tasks before the low priority queue', async () => {
    const prefetcher = new BodyPrefetcher()
    const fetched: string[] = []
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    prefetcher.configure({
      isCached: () => false,
      fetchBody: async (message) => {
        fetched.push(message.id)
        if (message.id === 'a') await gate
        return { ok: true, email: message }
      },
      onBodyLoaded: () => {},
      throttleMs: 0
    })

    prefetcher.enqueue('acc_1', [makeMessage('a'), makeMessage('b')])
    prefetcher.enqueue('acc_1', [makeMessage('z')], 'urgent')
    release()
    await wait(20)

    expect(fetched).toEqual(['a', 'z', 'b'])
  })

  it('does not fetch the same message twice while it is queued or in flight', async () => {
    const prefetcher = new BodyPrefetcher()
    const fetched: string[] = []
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    prefetcher.configure({
      isCached: () => false,
      fetchBody: async (message) => {
        fetched.push(message.id)
        await gate
        return { ok: true, email: message }
      },
      onBodyLoaded: () => {},
      throttleMs: 0
    })

    prefetcher.enqueue('acc_1', [makeMessage('1')])
    prefetcher.enqueue('acc_1', [makeMessage('1')], 'urgent')
    release()
    await wait(20)

    expect(fetched).toEqual(['1'])
  })

  it('retries failed fetches a bounded number of times', async () => {
    const prefetcher = new BodyPrefetcher()
    let calls = 0

    prefetcher.configure({
      isCached: () => false,
      fetchBody: async () => {
        calls += 1
        throw new Error('network down')
      },
      onBodyLoaded: () => {},
      throttleMs: 0,
      maxAttempts: 2
    })

    prefetcher.enqueue('acc_1', [makeMessage('1')])
    await wait(30)

    expect(calls).toBe(2)
    expect(prefetcher.pendingCount).toBe(0)
  })

  it('stop() cancels the in-flight fetch and drops the queue', async () => {
    const prefetcher = new BodyPrefetcher()
    const loaded: string[] = []
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    prefetcher.configure({
      isCached: () => false,
      fetchBody: async (message) => {
        await gate
        return { ok: true, email: message }
      },
      onBodyLoaded: (_accountId, message) => {
        loaded.push(message.id)
      },
      throttleMs: 0
    })

    prefetcher.enqueue('acc_1', [makeMessage('1'), makeMessage('2')])
    prefetcher.stop()
    release()
    await wait(20)

    expect(loaded).toEqual([])
    expect(prefetcher.pendingCount).toBe(0)
  })
})
