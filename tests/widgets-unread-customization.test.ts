import { describe, expect, it } from 'vitest'
import {
  DEFAULT_UNREAD_LIMIT,
  isUnreadConfigCustomized,
  resolveUnreadLimit,
  UNREAD_LIMIT_CHOICES
} from '../src/widgets/unreadCustomization'

describe('emails unread widget customization', () => {
  it('resolves the row limit with a safe default', () => {
    expect(resolveUnreadLimit(undefined)).toBe(DEFAULT_UNREAD_LIMIT)
    expect(resolveUnreadLimit({})).toBe(DEFAULT_UNREAD_LIMIT)
    expect(resolveUnreadLimit({ limit: '10' })).toBe(10)
    expect(resolveUnreadLimit({ limit: 3 })).toBe(3)
    expect(resolveUnreadLimit({ limit: 'oops' })).toBe(DEFAULT_UNREAD_LIMIT)
  })

  it('treats only a non-default limit as customization', () => {
    expect(isUnreadConfigCustomized(undefined)).toBe(false)
    expect(isUnreadConfigCustomized({})).toBe(false)
    expect(isUnreadConfigCustomized({ accountId: 'a1' })).toBe(false)
    expect(isUnreadConfigCustomized({ limit: '5' })).toBe(false)
    expect(isUnreadConfigCustomized({ limit: '10' })).toBe(true)
  })

  it('offers fixed limit choices for the host dialog', () => {
    expect(UNREAD_LIMIT_CHOICES).toEqual(['3', '5', '10'])
  })
})
