import { useEffect, useState } from 'react'
import { fetchUnreadWidgetEmails, type WidgetEmail } from '../services/emailWidgets'

export interface UnreadConfig {
  accountId?: string
  folder?: string
  limit?: number
}

interface UnreadState {
  loading: boolean
  error: string
  rows: WidgetEmail[]
  total: number
}

export function useUnreadEmailsWidget(
  isEditing: boolean,
  config: UnreadConfig
): UnreadState {
  const [state, setState] = useState<UnreadState>({ loading: true, error: '', rows: [], total: 0 })
  const accountId = config.accountId
  const folder = config.folder ?? 'INBOX'
  const limit = config.limit ?? 5

  useEffect(() => {
    if (isEditing) {
      setState((prev) => ({ ...prev, loading: false }))
      return
    }
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const result = await fetchUnreadWidgetEmails(accountId, folder, limit)
        if (!cancelled) setState({ loading: false, error: '', rows: result.rows, total: result.total })
      } catch (err) {
        if (!cancelled) {
          setState({ loading: false, error: err instanceof Error ? err.message : 'Load failed.', rows: [], total: 0 })
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, accountId, folder, limit])

  return state
}
