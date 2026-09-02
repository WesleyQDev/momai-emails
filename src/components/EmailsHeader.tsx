// src/components/EmailsHeader.tsx
// Top navigation header: provider SVG on the left, clean circular profile avatar on the right with account switcher

import React, { useState, useRef, useEffect } from 'react'
import {
  PlusIcon,
  TrashIcon,
  CameraIcon
} from '@heroicons/react/24/outline'
import { GmailIcon, OutlookIcon, YahooIcon, CustomMailIcon } from './ProviderIcons'
import { detectProviderFromEmail, PROVIDERS, ProviderId } from '../services/providers'
import type { PublicEmailAccount } from '../services/types'

// Authentic Gmail Material color palette per letter
const GMAIL_PALETTE: Record<string, string> = {
  A: '#1A73E8',
  B: '#0288D1',
  C: '#E8710A',
  D: '#7B1FA2',
  E: '#D93025',
  F: '#C2185B',
  G: '#1E8E3E',
  H: '#F29900',
  I: '#00897B',
  J: '#8E24AA',
  K: '#5C6BC0',
  L: '#0288D1',
  M: '#F9AB00',
  N: '#00897B',
  O: '#E8710A',
  P: '#C2185B',
  Q: '#7B1FA2',
  R: '#D93025',
  S: '#1A73E8',
  T: '#1E8E3E',
  U: '#F29900',
  V: '#00897B',
  W: '#5C6BC0',
  X: '#8E24AA',
  Y: '#F9AB00',
  Z: '#E8710A'
}

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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0]
  const providerId: ProviderId = activeAccount
    ? (activeAccount.provider as ProviderId) || detectProviderFromEmail(activeAccount.email)
    : 'custom'

  const providerConfig = PROVIDERS[providerId] || PROVIDERS.custom

  // Avatars map: stores custom uploaded avatar per account id
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const acc of accounts) {
      try {
        const saved = localStorage.getItem(`momai_emails_avatar_${acc.id}`)
        if (saved) map[acc.id] = saved
      } catch {}
    }
    return map
  })

  // Sync avatar map when accounts change
  useEffect(() => {
    const map: Record<string, string> = {}
    for (const acc of accounts) {
      try {
        const saved = localStorage.getItem(`momai_emails_avatar_${acc.id}`)
        if (saved) map[acc.id] = saved
      } catch {}
    }
    setAvatarMap(map)
  }, [accounts.map((a) => a.id).join(',')])

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

  // Handle local avatar upload for any account
  const uploadTargetRef = useRef<string | null>(null)
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const targetId = uploadTargetRef.current || activeAccount?.id
    if (!file || !targetId) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      setAvatarMap((prev) => ({ ...prev, [targetId]: base64 }))
      try {
        localStorage.setItem(`momai_emails_avatar_${targetId}`, base64)
      } catch {}
    }
    reader.readAsDataURL(file)
    // Reset file input so same file can be re-selected
    e.target.value = ''
  }

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
  const avatarBg = GMAIL_PALETTE[activeInitial] || '#1A73E8'
  const activeAvatar = activeAccount ? avatarMap[activeAccount.id] : null

  return (
    <header className="flex items-center justify-between border-b border-border bg-sidebar/70 backdrop-blur-xs px-5 py-2.5 select-none relative z-30">
      {/* 1. Left: Provider SVG & Platform Title */}
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

      {/* 2. Right: ONLY the circular Profile Avatar (no green/purple status dots) */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((prev) => !prev)}
          className="relative rounded-full focus:outline-hidden group cursor-pointer transition-transform active:scale-95 block"
          title={`${activeAccount?.name || activeAccount?.email || 'Perfil'} (Clique para alternar contas)`}
        >
          {activeAvatar ? (
            <img
              src={activeAvatar}
              alt="Perfil"
              className="w-8 h-8 rounded-full object-cover shadow-xs"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full font-bold text-white text-xs flex items-center justify-center select-none shadow-xs"
              style={{ backgroundColor: avatarBg }}
            >
              {activeInitial}
            </div>
          )}
        </button>

        {/* Profile Dropdown Popover */}
        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-2.5 w-80 rounded-2xl bg-card border border-border shadow-2xl p-3.5 z-50 text-xs space-y-3 animate-in fade-in zoom-in-95 duration-100">
            {/* Active Account Info Card */}
            {activeAccount && (
              <div className="p-3 rounded-xl bg-input/40 border border-border flex items-center gap-3 relative group/avatar">
                {/* Clickable avatar with change photo icon */}
                <div
                  onClick={() => {
                    uploadTargetRef.current = activeAccount?.id || null
                    fileInputRef.current?.click()
                  }}
                  className="relative cursor-pointer shrink-0"
                  title="Carregar foto personalizada de perfil"
                >
                  {activeAvatar ? (
                    <img
                      src={activeAvatar}
                      alt="Perfil"
                      className="w-12 h-12 rounded-full object-cover shadow-xs"
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-full font-bold text-white text-base flex items-center justify-center select-none shadow-xs"
                      style={{ backgroundColor: avatarBg }}
                    >
                      {activeInitial}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-opacity text-white">
                    <CameraIcon className="w-4 h-4" />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-bold text-text truncate text-sm">
                    {activeAccount.name || activeAccount.email}
                  </div>
                  <div className="text-[11px] text-text-muted truncate">
                    {activeAccount.email}
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
                      const accBg = GMAIL_PALETTE[initial] || '#1A73E8'
                      const accAvatar = avatarMap[acc.id]
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
                            {accAvatar ? (
                              <img
                                src={accAvatar}
                                alt={acc.email}
                                className="w-8 h-8 rounded-full object-cover shrink-0 shadow-xs"
                              />
                            ) : (
                              <div
                                className="w-8 h-8 rounded-full font-bold text-white text-xs flex items-center justify-center shrink-0 shadow-xs"
                                style={{ backgroundColor: accBg }}
                              >
                                {initial}
                              </div>
                            )}
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

              {/* Option to disconnect active account */}
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

      {/* Hidden file input for avatar upload (shared for all accounts) */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleAvatarChange}
        accept="image/*"
        className="hidden"
      />
    </header>
  )
}
