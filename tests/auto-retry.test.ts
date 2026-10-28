import { describe, it, expect } from 'vitest'
import { AUTO_RETRY_DELAYS_MS, nextAutoRetryDelay } from '../src/services/auto-retry'

describe('automatic folder retry backoff', () => {
  it('starts fast so a socket blip is invisible', () => {
    expect(nextAutoRetryDelay(0)).toBe(2000)
    expect(nextAutoRetryDelay(1)).toBe(5000)
  })

  it('grows the delay and then stays capped', () => {
    expect(nextAutoRetryDelay(2)).toBe(10000)
    expect(nextAutoRetryDelay(3)).toBe(20000)
    expect(nextAutoRetryDelay(4)).toBe(30000)
    expect(nextAutoRetryDelay(9)).toBe(30000)
    expect(nextAutoRetryDelay(1000)).toBe(AUTO_RETRY_DELAYS_MS[AUTO_RETRY_DELAYS_MS.length - 1])
  })

  it('treats invalid attempts as the first one', () => {
    expect(nextAutoRetryDelay(-1)).toBe(2000)
    expect(nextAutoRetryDelay(Number.NaN)).toBe(2000)
  })

  it('never schedules a hot loop: the cap stays at half a minute', () => {
    expect(Math.max(...AUTO_RETRY_DELAYS_MS)).toBe(30000)
  })
})
