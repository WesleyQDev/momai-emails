// src/components/EmailsHeader.tsx
// Top navigation header showing provider SVG on the left and active account profile dropdown on the right

import React, { useState, useRef, useEffect } from 'react'
import {
  ChevronDownIcon,
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  UserCircleIcon
} from '@heroicons/react/24/outline'
import { GmailIcon, OutlookIcon, YahooIcon, CustomMailIcon } from './ProviderIcons'
import { detectProviderFromEmail, PROVIDERS, ProviderId } from '../services/providers'
import type { PublicEmailAccount } from '../services/types'

interface EmailsHeaderProps {
  accounts: PublicEmailAccount[]
  activeAccountId: string | null
  onSelectAccount: (id: string) => void
  onOpenAddModal: () => void
  onRemoveAccount: (id: string) => void
}

export const EmailsHeader: React.FC<EmailsHeaderProps> = ({
  accounts,
  activeAccountId,
  onSelectAccount,
  onOpenAddModal,
  onRemoveAccount
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const activeAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0]
  const providerId: ProviderId = activeAccount
    ? (activeAccount.provider as ProviderId) || detectProviderFromEmail(activeAccount.email)
    : 'custom'

  const providerConfig = PROVIDERS[providerId] || PROVIDERS.custom

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen])

  const renderProviderIcon = (sizeClass = 'w-6 h-6') => {
    switch (providerId) {
      case 'gmail':
        return <GmailIcon className={sizeClass} />
      case 'outlook':
      case 'hotmail':
        return <OutlookIcon className={sizeClass} />
      case 'yahoo':
        return <YahooIcon className={sizeClass} />
      default:
        return <CustomMailIcon className={sizeClass} />
    }
  }

  const activeInitial = activeAccount?.email ? activeAccount.email.charAt(0).toUpperCase() : '?'

  return (
    <header className="flex items-center justify-between border-b border-border bg-sidebar/70 backdrop-blur-xs px-5 py-2.5 select-none relative z-30">
      {/* 1. Left: Provider SVG & Brand Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center shrink-0 drop-shadow-xs">
          {renderProviderIcon('w-6 h-6')}
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-text tracking-tight">
              {providerConfig.name}
            </span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-input/70 border border-border text-text-muted">
              MomAI E-mails
            </span>
          </div>
          {activeAccount && (
            <span className="text-[11px] text-text-muted font-normal truncate max-w-[260px]">
              {activeAccount.email}
            </span>
          )}
        </div>
      </div>

      {/* 2. Right: Active Profile Button & Switcher Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((prev) => !prev)}
          className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
            dropdownOpen
              ? 'bg-card border-accent shadow-xs text-text'
              : 'bg-input/40 hover:bg-input border-border/80 text-text hover:border-accent/40'
          }`}
          title="Alternar conta de e-mail"
        >
          {/* Avatar circle with online indicator */}
          <div className="relative shrink-0">
            <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/40 text-accent font-bold text-xs flex items-center justify-center shadow-xs">
              {activeInitial}
            </div>
            {activeAccount?.status === 'connected' && (
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-card" />
            )}
          </div>

          {/* Account name & Chevron */}
          <div className="flex flex-col text-left hidden sm:flex">
            <span className="text-xs font-semibold text-text truncate max-w-[130px] leading-tight">
              {activeAccount?.name || activeAccount?.email?.split('@')[0] || 'Conta'}
            </span>
            <span className="text-[10px] text-text-muted truncate max-w-[130px]">
              Alternar conta
            </span>
          </div>

          <ChevronDownIcon
            className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${
              dropdownOpen ? 'rotate-180 text-accent' : ''
            }`}
          />
        </button>

        {/* Profile Dropdown Popover */}
        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl bg-card border border-border shadow-2xl p-3 z-50 text-xs space-y-3 animate-in fade-in zoom-in-95 duration-100">
            {/* Active Account Info Card */}
            {activeAccount && (
              <div className="p-3 rounded-xl bg-input/40 border border-border flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-accent/20 border border-accent/40 text-accent font-bold text-base flex items-center justify-center shrink-0">
                  {activeInitial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-text truncate text-sm">
                    {activeAccount.name || activeAccount.email}
                  </div>
                  <div className="text-[11px] text-text-muted truncate">
                    {activeAccount.email}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-accent font-medium">
                    <CheckCircleIcon className="w-3.5 h-3.5" />
                    <span>Conta ativa</span>
                  </div>
                </div>
              </div>
            )}

            {/* Other Accounts List */}
            {accounts.length > 1 && (
              <div className="space-y-1">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  Outras contas conectadas
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1 pr-0.5">
                  {accounts
                    .filter((a) => a.id !== activeAccountId)
                    .map((acc) => {
                      const initial = acc.email.charAt(0).toUpperCase()
                      return (
                        <div
                          key={acc.id}
                          onClick={() => {
                            onSelectAccount(acc.id)
                            setDropdownOpen(false)
                          }}
                          className="group flex items-center justify-between p-2 rounded-xl hover:bg-input border border-transparent hover:border-border cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-input border border-border text-text font-bold text-xs flex items-center justify-center shrink-0">
                              {initial}
                            </div>
                            <div className="flex flex-col min-w-0 text-left">
                              <span className="font-medium text-text truncate max-w-[150px]">
                                {acc.name || acc.email}
                              </span>
                              <span className="text-[10px] text-text-muted truncate max-w-[150px]">
                                {acc.email}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirm(`Remover a conta ${acc.email}?`)) {
                                onRemoveAccount(acc.id)
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-card text-text-muted hover:text-text transition-all"
                            title="Remover conta"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* Footer Action: Add another account */}
            <div className="pt-2 border-t border-border flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false)
                  onOpenAddModal()
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-input/50 hover:bg-input border border-dashed border-border text-text font-medium transition-colors cursor-pointer"
              >
                <PlusIcon className="w-4 h-4 text-accent" />
                <span>Adicionar outra conta</span>
              </button>

              {/* Option to remove active account if needed */}
              {activeAccount && (
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false)
                    if (confirm(`Remover a conta ativa (${activeAccount.email})?`)) {
                      onRemoveAccount(activeAccount.id)
                    }
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-text-muted hover:text-text transition-colors"
                >
                  <TrashIcon className="w-3 h-3" />
                  <span>Desconectar esta conta</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
