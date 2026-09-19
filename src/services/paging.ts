// src/services/paging.ts
// Shared page size and numbered-page window for the message list.

export const EMAIL_PAGE_SIZE = 30

export interface PageWindow {
  start: number
  end: number
}

export function getPageWindow(count: number, page: number, pageSize: number): PageWindow {
  const safePage = Math.max(0, page)
  const start = safePage * pageSize
  return { start, end: Math.min(start + pageSize, Math.max(0, count)) }
}
