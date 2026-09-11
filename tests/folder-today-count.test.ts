import { describe, it, expect } from 'vitest'
import { getUnreadWindowStart, countUnreadInWindowInFolder } from '../email-client'

describe('email-client last-48h folder counts', () => {
  it('starts the window about 48 hours ago by default', () => {
    const start = getUnreadWindowStart()
    const ageMs = Date.now() - start.getTime()
    expect(ageMs).toBeGreaterThan(47 * 60 * 60 * 1000)
    expect(ageMs).toBeLessThan(49 * 60 * 60 * 1000)
  })

  it('supports a 24 hour window when requested', () => {
    const start = getUnreadWindowStart(24)
    const ageMs = Date.now() - start.getTime()
    expect(ageMs).toBeGreaterThan(23 * 60 * 60 * 1000)
    expect(ageMs).toBeLessThan(25 * 60 * 60 * 1000)
  })

  it('counts only UNSEEN SINCE the window start and releases the lock', async () => {
    let released = false
    const fakeClient = {
      getMailboxLock: async () => ({
        release: () => {
          released = true
        }
      }),
      search: async (criteria: any) => {
        expect(criteria.seen).toBe(false)
        expect(criteria.since instanceof Date).toBe(true)
        const ageMs = Date.now() - criteria.since.getTime()
        expect(ageMs).toBeGreaterThan(47 * 60 * 60 * 1000)
        expect(ageMs).toBeLessThan(49 * 60 * 60 * 1000)
        return [11, 22, 33]
      }
    }
    await expect(countUnreadInWindowInFolder(fakeClient, 'INBOX')).resolves.toBe(3)
    expect(released).toBe(true)
  })

  it('returns null when search fails so callers keep the old total', async () => {
    const failingClient = {
      getMailboxLock: async () => {
        throw new Error('locked')
      },
      search: async () => [1]
    }
    await expect(countUnreadInWindowInFolder(failingClient, 'INBOX')).resolves.toBeNull()
  })
})
