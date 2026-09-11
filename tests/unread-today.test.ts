import { describe, it, expect } from 'vitest'
import {
  UNREAD_WINDOW_MS,
  isWithinUnreadWindow,
  countUnreadInWindow,
  getFolderDisplayUnread,
  adjustFolderUnread
} from '../src/services/unread-today'

describe('unread window (badges show last 48h)', () => {
  it('uses a 48 hour window', () => {
    expect(UNREAD_WINDOW_MS).toBe(48 * 60 * 60 * 1000)
  })

  it('treats a message sent 25 hours ago as inside the window', () => {
    const now = Date.now()
    const twentyFiveHoursAgo = now - 25 * 60 * 60 * 1000
    expect(isWithinUnreadWindow(twentyFiveHoursAgo, now)).toBe(true)
  })

  it('ignores a message sent 50 hours ago', () => {
    const now = Date.now()
    const fiftyHoursAgo = now - 50 * 60 * 60 * 1000
    expect(isWithinUnreadWindow(fiftyHoursAgo, now)).toBe(false)
  })

  it('counts only unread messages received in the window', () => {
    const now = Date.now()
    const inside = now - 30 * 60 * 60 * 1000
    const outside = now - 50 * 60 * 60 * 1000
    const messages = [
      { id: '1', read: false, timestamp: now },
      { id: '2', read: false, timestamp: inside },
      { id: '3', read: false, timestamp: outside },
      { id: '4', read: true, timestamp: now },
      { id: '5', read: false, timestamp: inside }
    ]
    expect(countUnreadInWindow(messages as any, now)).toBe(3)
  })

  it('prefers window count for folder badges when available', () => {
    expect(getFolderDisplayUnread({ unreadCount: 4821, unreadToday: 9, unreadWindow: 5 } as any)).toBe(5)
    expect(getFolderDisplayUnread({ unreadCount: 4821, unreadToday: 9 } as any)).toBe(9)
    expect(getFolderDisplayUnread({ unreadCount: 4821 } as any)).toBe(4821)
  })

  it('decrements the active folder badge when an unread message is read', () => {
    const folders = [
      { path: 'INBOX', name: 'INBOX', unreadCount: 4, totalCount: 100, unreadWindow: 4 },
      { path: 'Sent', name: 'Sent', unreadCount: 0, totalCount: 10 }
    ]
    const updated = adjustFolderUnread(folders as any, 'INBOX', -1)
    expect(updated[0].unreadCount).toBe(3)
    expect(updated[0].unreadWindow).toBe(3)
    expect(updated[1].unreadCount).toBe(0)
  })

  it('never drops a folder badge below zero', () => {
    const folders = [{ path: 'INBOX', name: 'INBOX', unreadCount: 0, totalCount: 100 }]
    const updated = adjustFolderUnread(folders as any, 'INBOX', -1)
    expect(updated[0].unreadCount).toBe(0)
  })

  it('increments the folder badge when a message is marked unread', () => {
    const folders = [{ path: 'INBOX', name: 'INBOX', unreadCount: 2, totalCount: 100, unreadWindow: 2 }]
    const updated = adjustFolderUnread(folders as any, 'inbox', 1)
    expect(updated[0].unreadCount).toBe(3)
    expect(updated[0].unreadWindow).toBe(3)
  })
})
