import type { JSX } from 'react'
import { useExtensionLocale } from '../services/i18n'
import type { WidgetProps } from './types'
import { useUnreadEmailsWidget, type UnreadConfig } from './hooks/useUnreadEmailsWidget'
import { WidgetLoading, WidgetState } from './components/WidgetState'

export default function EmailsUnreadWidget({ config, isEditing = false }: WidgetProps<UnreadConfig>): JSX.Element {
  const { t } = useExtensionLocale()
  const safeConfig: UnreadConfig = config ?? {}
  const { loading, error, rows, total } = useUnreadEmailsWidget(isEditing, safeConfig)

  if (!safeConfig.accountId) {
    return <WidgetState title={t('widget.unread.title')} message={t('widget.unread.needsSetup')} />
  }

  if (loading) return <WidgetLoading message={t('widget.unread.loading')} />
  if (error) return <WidgetState title={t('widget.unread.title')} message={error} />
  if (rows.length === 0) return <WidgetState title={t('widget.unread.title')} message={t('widget.unread.empty')} />

  return (
    <div className="w-full h-full flex flex-col min-h-0 overflow-hidden p-3 gap-2">
      <div className="flex items-center justify-between shrink-0">
        <span className="text-xs font-bold text-text">{t('widget.unread.title')}</span>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/20">
          {total}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 min-h-0 overflow-hidden">
        {rows.map((row) => (
          <div key={row.id} className="px-2.5 py-2 rounded-xl bg-bg/50 border border-border/20 min-w-0">
            <div className="text-[11px] font-semibold text-text truncate">{row.from}</div>
            <div className="text-xs text-text truncate">{row.subject}</div>
            <div className="text-[11px] text-text-muted truncate">{row.snippet}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
