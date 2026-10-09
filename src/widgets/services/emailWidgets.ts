import { emailApi } from '../../services/api'

export interface WidgetEmail {
  id: string
  from: string
  subject: string
  snippet: string
  date: string
}

/** The list tool returns `from` as { name, address }; a raw String() would
 * render "[object Object]" in the widget. Exported for tests. */
export function formatWidgetSender(value: unknown): string {
  if (!value) return 'Unknown'
  if (typeof value === 'string') return value
  const entry = value as { name?: unknown; address?: unknown }
  const name = typeof entry.name === 'string' ? entry.name.trim() : ''
  const address = typeof entry.address === 'string' ? entry.address.trim() : ''
  return name || address || 'Unknown'
}

/**
 * Lists unread inbox messages through the existing emailApi service.
 * Keeps the widget thin by reusing listEmails with unreadOnly.
 */
export async function fetchUnreadWidgetEmails(
  accountId?: string,
  folder = 'INBOX',
  limit = 5
): Promise<{ rows: WidgetEmail[]; total: number }> {
  // The widget shows no category tabs: skip Gmail category lookups entirely.
  const res = await emailApi.listEmails(folder, accountId, limit, true, 0, false)
  const messages: any[] = (res as any)?.messages ?? []
  const safeLimit = Math.max(1, Math.floor(limit) || 5)
  return {
    total: Number((res as any)?.total ?? messages.length),
    rows: messages.slice(0, safeLimit).map((item, index) => ({
      id: String(item.id ?? item.messageId ?? `${index}`),
      from: formatWidgetSender(item.from),
      subject: String(item.subject ?? '(no subject)'),
      snippet: String(item.snippet ?? item.preview ?? ''),
      date: String(item.date ?? '')
    }))
  }
}
