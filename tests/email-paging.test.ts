import { describe, it, expect } from 'vitest'
import { EMAIL_PAGE_SIZE, getPageWindow } from '../src/services/paging'

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
})
