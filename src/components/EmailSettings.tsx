// src/components/EmailSettings.tsx
// Full settings page replacing the message list. Groups the most important
// Gmail-style choices: notifications, inbox display and the account summary.

import React from 'react'
import { ArrowLeftIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import type { EmailSettings as EmailSettingsState, UnreadWindowHours } from '../services/settings'
import { useExtensionLocale } from '../services/i18n'

interface EmailSettingsProps {
  accountEmail: string
  providerName: string
  unreadCount: number
  windowHours: UnreadWindowHours
  settings: EmailSettingsState
  syncing: boolean
  onChange: (patch: Partial<EmailSettingsState>) => void
  onSync: () => void
  onBack: () => void
}

const Toggle: React.FC<{ on: boolean; onToggle: () => void; label: string }> = ({ on, onToggle, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={onToggle}
    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ease-in-out focus:outline-none ${
      on ? 'bg-accent border-accent' : 'bg-input border-border/80'
    }`}
  >
    <span
      className={`pointer-events-none inline-block h-3.5 w-3.5 my-auto transform rounded-full shadow transition duration-200 ease-in-out ${
        on ? 'translate-x-4 bg-bg' : 'translate-x-0.5 bg-text-muted'
      }`}
    />
  </button>
)

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="rounded-2xl bg-card border border-border overflow-hidden">
    <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{title}</div>
    <div className="divide-y divide-border">{children}</div>
  </section>
)

const Row: React.FC<{ label: string; hint?: string; control: React.ReactNode }> = ({ label, hint, control }) => (
  <label className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer">
    <span className="min-w-0">
      <span className="block font-medium text-text text-sm">{label}</span>
      {hint && <span className="block text-xs text-text-muted mt-0.5">{hint}</span>}
    </span>
    {control}
  </label>
)

export const EmailSettings: React.FC<EmailSettingsProps> = ({
  accountEmail,
  providerName,
  unreadCount,
  windowHours,
  settings,
  syncing,
  onChange,
  onSync,
  onBack
}) => {
  const { t } = useExtensionLocale()

  return (
    <div className="flex-1 min-h-0 flex flex-col border-l border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-full hover:bg-input text-text-muted hover:text-text transition-colors cursor-pointer"
          title={t('settings.back')}
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <h2 className="text-sm font-bold text-text">{t('settings.title')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl w-full mx-auto">
        <div className="p-4 rounded-2xl bg-input/40 border border-border">
          <div className="font-bold text-text text-sm truncate">{accountEmail}</div>
          <div className="text-xs text-text-muted mt-0.5">
            {providerName} · {t('settings.unreadSummary', { count: unreadCount, window: windowHours })}
          </div>
        </div>

        <Section title={t('settings.notificationsSection')}>
          <Row
            label={t('settings.notifyPrimaryOnly')}
            hint={t('settings.notifyPrimaryOnlyHint')}
            control={
              <Toggle
                on={settings.notifyPrimaryOnly}
                onToggle={() => onChange({ notifyPrimaryOnly: !settings.notifyPrimaryOnly })}
                label={t('settings.notifyPrimaryOnly')}
              />
            }
          />
        </Section>

        <Section title={t('settings.inboxSection')}>
          <Row
            label={t('settings.showCategoryTabs')}
            hint={t('settings.showCategoryTabsHint')}
            control={
              <Toggle
                on={settings.showCategoryTabs}
                onToggle={() => onChange({ showCategoryTabs: !settings.showCategoryTabs })}
                label={t('settings.showCategoryTabs')}
              />
            }
          />
          <Row
            label={t('settings.unreadWindow')}
            hint={t('settings.unreadWindowHint')}
            control={
              <div className="flex rounded-full bg-input border border-border p-0.5 shrink-0" role="group">
                {([24, 48] as const).map((hours) => (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => onChange({ unreadWindowHours: hours })}
                    aria-pressed={settings.unreadWindowHours === hours}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                      settings.unreadWindowHours === hours ? 'bg-accent text-bg' : 'text-text-muted hover:text-text'
                    }`}
                  >
                    {t('settings.unreadWindowHours', { hours })}
                  </button>
                ))}
              </div>
            }
          />
          <Row
            label={t('settings.autoMarkRead')}
            hint={t('settings.autoMarkReadHint')}
            control={
              <Toggle
                on={settings.autoMarkRead}
                onToggle={() => onChange({ autoMarkRead: !settings.autoMarkRead })}
                label={t('settings.autoMarkRead')}
              />
            }
          />
        </Section>

        <Section title={t('settings.accountSection')}>
          <div className="px-4 py-3">
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-input/50 hover:bg-input border border-border text-text text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-4 h-4 text-accent ${syncing ? 'animate-spin' : ''}`} />
              <span>{t('settings.syncNow')}</span>
            </button>
          </div>
        </Section>
      </div>
    </div>
  )
}
