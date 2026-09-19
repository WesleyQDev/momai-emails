import { emailApi } from '../../services/api'

export interface WidgetEmail {
  id: string
  from: string
  subject: string
  snippet: string
  date: string
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
  const res = await emailApi.listEmails(folder, accountId, limit, true, 0)
  const messages: any[] = (res as any)?.messages ?? []
  return {
    total: Number((res as any)?.total ?? messages.length),
    rows: messages.slice(0, 3).map((item, index) => ({
      id: String(item.id ?? item.messageId ?? `${index}`),
      from: String(item.from ?? 'Unknown'),
      subject: String(item.subject ?? '(no subject)'),
      snippet: String(item.snippet ?? item.preview ?? ''),
      date: String(item.date ?? '')
    }))
  }
}
