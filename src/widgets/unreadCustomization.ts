export const DEFAULT_UNREAD_LIMIT = 5

export const UNREAD_LIMIT_CHOICES = ['3', '5', '10']

export function resolveUnreadLimit(config?: Record<string, unknown> | null): number {
  const raw = (config as { limit?: number | string } | undefined)?.limit
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_UNREAD_LIMIT
  return Math.floor(parsed)
}

export function isUnreadConfigCustomized(config?: Record<string, unknown> | null): boolean {
  const raw = (config as { limit?: number | string } | undefined)?.limit
  if (raw === undefined || raw === null || raw === '') return false
  return Number(raw) !== DEFAULT_UNREAD_LIMIT
}
