// src/components/AccountTabs.tsx
// Top tabs to switch between email accounts, add new accounts, and view status

import React from 'react'
import { PlusIcon, TrashIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import type { PublicEmailAccount } from '../services/types'
import { useExtensionLocale } from '../services/i18n'

interface AccountTabsProps {
  accounts: PublicEmailAccount[]
  activeAccountId: string | null
  onSelectAccount: (id: string) => void
  onOpenAddModal: () => void
  onRemoveAccount: (id: string) => void
}

export const AccountTabs: React.FC<AccountTabsProps> = ({
  accounts,
  activeAccountId,
  onSelectAccount,
  onOpenAddModal,
  onRemoveAccount
}) => {
  const { t } = useExtensionLocale()
  return (
    <div className="flex items-center justify-between border-b border-border bg-sidebar/50 px-4 py-2 select-none">
      {/* Tabs list */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
        {accounts.map((acc) => {
          const isActive = acc.id === activeAccountId
          const initial = acc.email.charAt(0).toUpperCase()

          return (
            <div
              key={acc.id}
              onClick={() => onSelectAccount(acc.id)}
              className={`group flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border ${
                isActive
                  ? 'bg-card text-text border-accent shadow-sm'
                  : 'bg-input/40 text-text-muted border-transparent hover:bg-input hover:text-text'
              }`}
            >
              {/* Account initial circle */}
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isActive ? 'bg-accent text-bg' : 'bg-input text-text-muted'
                }`}
              >
                {initial}
              </div>

              {/* Email label */}
              <div className="flex flex-col text-left">
                <span className="truncate max-w-[140px] font-semibold">{acc.name || acc.email}</span>
                <span className="text-[10px] text-text-muted truncate max-w-[140px]">{acc.email}</span>
              </div>

              {/* Status indicator */}
              {acc.status === 'connected' ? (
                <CheckCircleIcon className="w-3.5 h-3.5 text-accent opacity-75" title={t('tabs.connected')} />
              ) : acc.status === 'error' ? (
                <ExclamationTriangleIcon className="w-3.5 h-3.5 text-text-muted" title={acc.lastError || t('tabs.connectionError')} />
              ) : null}

              {/* Remove button (appears on hover) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(t('header.accounts.removeConfirm', { email: acc.email }))) {
                    onRemoveAccount(acc.id)
                  }
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-input text-text-muted hover:text-text transition-opacity ml-1"
                title={t('header.accounts.remove')}
              >
                <TrashIcon className="w-3 h-3" />
              </button>
            </div>
          )
        })}

        {/* Add Account Button */}
        <button
          type="button"
          onClick={onOpenAddModal}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-input/40 hover:bg-input text-text-muted hover:text-text border border-dashed border-border transition-colors whitespace-nowrap"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          <span>{t('tabs.add')}</span>
        </button>
      </div>
    </div>
  )
}
