import { describe, it, expect } from 'vitest'
import { shouldAcceptAccountsResponse } from '../src/services/accounts-sync'

const CACHED = [{ id: 'acc_1', email: 'user@gmail.com' }]

describe('accounts sync guard', () => {
  it('accepts a non-empty worker response', () => {
    expect(shouldAcceptAccountsResponse(CACHED, CACHED)).toBe(true)
    expect(shouldAcceptAccountsResponse(CACHED, [])).toBe(true)
  })

  it('rejects a transient empty response while known accounts exist', () => {
    expect(shouldAcceptAccountsResponse([], CACHED)).toBe(false)
  })

  it('accepts an empty response when no accounts are known', () => {
    expect(shouldAcceptAccountsResponse([], [])).toBe(true)
  })

  it('accepts an empty response on explicit removal', () => {
    expect(shouldAcceptAccountsResponse([], CACHED, true)).toBe(true)
  })
})
