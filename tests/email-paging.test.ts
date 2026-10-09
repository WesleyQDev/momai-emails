import { describe, it, expect } from 'vitest'
import {
  EMAIL_PAGE_SIZE,
  INBOX_FIRST_LOAD_LIMIT,
  INBOX_CATEGORY_FIRST_LOAD,
  getPageWindow,
  nextFreshRunLength
} from '../src/services/paging'
import { MAX_STORED_FOLDER_MESSAGES } from '../src/services/cache'

describe('email paging', () => {
  it('loads thirty messages per page', () => {
    expect(EMAIL_PAGE_SIZE).toBe(30)
  })

  it('slices thirty-message page windows', () => {
    expect(getPageWindow(95, 0, 30)).toEqual({ start: 0, end: 30 })
    expect(getPageWindow(95, 1, 30)).toEqual({ start: 30, end: 60 })
    expect(getPageWindow(95, 3, 30)).toEqual({ start: 90, end: 95 })
    expect(getPageWindow(0, 0, 30)).toEqual({ start: 0, end: 0 })
    expect(getPageWindow(20, 2, 30)).toEqual({ start: 60, end: 20 })
  })

  it('fetches a multi-page inbox window so page 1 fills in one shot', () => {
    expect(INBOX_FIRST_LOAD_LIMIT).toBeGreaterThanOrEqual(EMAIL_PAGE_SIZE * 3)
    // The whole first-load window must fit the instant cache for the next open.
    expect(INBOX_FIRST_LOAD_LIMIT).toBe(MAX_STORED_FOLDER_MESSAGES)
  })

  it('preloads at least a full page of the Primary category', () => {
    expect(INBOX_CATEGORY_FIRST_LOAD).toBeGreaterThanOrEqual(EMAIL_PAGE_SIZE)
    expect(INBOX_CATEGORY_FIRST_LOAD).toBe(EMAIL_PAGE_SIZE * 2)
  })

  it('starts a fresh run on the first load', () => {
    expect(nextFreshRunLength(null, null, 150, 7926)).toBe(150)
  })

  it('grows the run when mail arrives between refreshes', () => {
    // 300 loaded, 20 arrived: the run now spans 320 contiguous messages.
    expect(nextFreshRunLength(300, 7906, 150, 7926)).toBe(320)
  })

  it('shrinks the run when mail is deleted between refreshes', () => {
    // 300 loaded, 5 deleted: the run now spans 295 contiguous messages.
    expect(nextFreshRunLength(300, 7931, 150, 7926)).toBe(295)
  })

  it('never drops below the just-fetched window', () => {
    // Mailbox wiped while away: keep at least what the server just returned.
    expect(nextFreshRunLength(300, 7926, 40, 40)).toBe(40)
  })
})
