// src/components/EmailsHeader.tsx
// Top navigation header: provider SVG on the left, clean circular profile avatar on the right with account switcher

import React, { useState, useRef, useEffect } from 'react'
import {
  PlusIcon,
  TrashIcon,
  CameraIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline'
import { GmailIcon, OutlookIcon, YahooIcon, YahooMailWordmark, CustomMailIcon } from './ProviderIcons'
import { detectProviderFromEmail, PROVIDERS, ProviderId } from '../services/providers'
import type { PublicEmailAccount } from '../services/types'
import { useExtensionLocale } from '../services/i18n'
import {
  defaultAvatarStore,
  downscaleImageFileToAvatar,
  isSupportedAvatarDataUrl,
  loadAvatar,
  saveAvatar,
} from '../services/avatar-storage'
import { emailApi } from '../services/api'

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
  searchQuery?: string
  onSearchChange?: (q: string) => void
  onOpenSettings?: () => void
}

export const EmailsHeader: React.FC<EmailsHeaderProps> = ({
  accounts,
  activeAccountId,
  onSelectAccount,
  onOpenAddModal,
  onRemoveAccount,
  searchQuery = '',
  onSearchChange,
  onOpenSettings
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const { t } = useExtensionLocale()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0]
  const providerId: ProviderId = activeAccount
    ? (activeAccount.provider as ProviderId) || detectProviderFromEmail(activeAccount.email)
    : 'custom'

  const providerConfig = PROVIDERS[providerId] || PROVIDERS.custom

  // Avatars map: stores downscaled custom avatar per account id
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    const store = defaultAvatarStore()
    for (const acc of accounts) {
      const saved = loadAvatar(store, acc.id)
      if (saved) map[acc.id] = saved
    }
    return map
  })

  // Sync avatar map when accounts change.
  // Local cache paints instantly; host storage is authoritative and survives restarts.
  useEffect(() => {
    const store = defaultAvatarStore()
    const cached: Record<string, string> = {}
    for (const acc of accounts) {
      const saved = loadAvatar(store, acc.id)
      if (saved) cached[acc.id] = saved
    }
    setAvatarMap(cached)
    let cancelled = false
    void (async () => {
      const next: Record<string, string> = {}
      for (const acc of accounts) {
        try {
          const res = await emailApi.getAvatar(acc.id)
          const avatar = res?.avatar
          if (cancelled) return
          if (isSupportedAvatarDataUrl(avatar)) {
            next[acc.id] = avatar
            saveAvatar(store, acc.id, avatar)
          } else if (cached[acc.id]) {
            const pushed = await emailApi.setAvatar(acc.id, cached[acc.id])
            if (pushed?.ok) next[acc.id] = cached[acc.id]
          }
        } catch {}
      }
      if (!cancelled) setAvatarMap(next)
    })()
    return () => {
      cancelled = true
    }
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

  // Handle avatar upload for any account: persist in host storage first,
  // mirror to the local cache only after the worker confirms the save.
  const uploadTargetRef = useRef<string | null>(null)
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const targetId = uploadTargetRef.current || activeAccount?.id
    // Reset file input so same file can be re-selected
    e.target.value = ''
    if (!file || !targetId) return
    try {
      const thumbnail = await downscaleImageFileToAvatar(file)
      const res = await emailApi.setAvatar(targetId, thumbnail)
      if (!res?.ok) return
      saveAvatar(defaultAvatarStore(), targetId, thumbnail)
      setAvatarMap((prev) => ({ ...prev, [targetId]: thumbnail }))
    } catch {
      // Keep the previous avatar when the upload cannot be persisted.
    }
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
    <header className="flex items-center justify-between gap-4 bg-sidebar/70 backdrop-blur-xs px-5 py-2.5 select-none relative z-30">
      {/* 1. Left: Provider branding (Yahoo uses the official wordmark alone) */}
      <div className="flex items-center gap-2.5 shrink-0 min-w-[120px]">
        {providerId === 'yahoo' ? (
          <YahooMailWordmark />
        ) : (
          <>
            <div className="flex items-center justify-center shrink-0 drop-shadow-xs">
              {renderProviderIcon('w-6 h-6')}
            </div>
            <span className="text-sm font-bold text-text tracking-tight">
              {providerConfig.name}
            </span>
          </>
        )}
      </div>

      {/* 2. Center: Search Bar (Gmail style) */}
      {onSearchChange && (
        <div className="flex-1 max-w-xl mx-2 sm:mx-4 flex items-center justify-center">
          <div className="w-full flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-input/70 hover:bg-input border border-border/80 focus-within:border-accent focus-within:bg-input focus-within:shadow-xs transition-all">
            <MagnifyingGlassIcon className="w-4 h-4 text-text-muted shrink-0 pointer-events-none" />
            <input
              type="text"
              placeholder={t('header.search.placeholder')}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-transparent border-0 p-0 text-xs text-text placeholder:text-text-muted outline-none focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="text-text-muted hover:text-text p-0.5 rounded-full cursor-pointer transition-colors"
                title={t('header.search.clear')}
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. Right: settings gear + circular Profile Avatar (no green/purple status dots) */}
      <div className="relative shrink-0 min-w-[120px] flex justify-end items-center gap-1" ref={dropdownRef}>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-2 rounded-full hover:bg-input text-text-muted hover:text-text transition-colors cursor-pointer"
            title={t('settings.title')}
          >
            <Cog6ToothIcon className="w-5 h-5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setDropdownOpen((prev) => !prev)}
          className="relative rounded-full outline-none focus:outline-none group cursor-pointer transition-transform active:scale-95 block"
          title={`${activeAccount?.name || activeAccount?.email || t('header.profile.alt')} (${t('header.profile.switch')})`}
        >
          {activeAvatar ? (
            <img
              src={activeAvatar}
              alt={t('header.profile.alt')}
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
                  title={t('header.avatar.change')}
                >
                  {activeAvatar ? (
                    <img
                      src={activeAvatar}
                      alt={t('header.profile.alt')}
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
                  {t('header.accounts.other')}
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
                              if (confirm(t('header.accounts.removeConfirm', { email: acc.email }))) {
                                onRemoveAccount(acc.id)
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-card text-text-muted hover:text-text transition-all"
                            title={t('header.accounts.remove')}
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
                <span>{t('header.accounts.add')}</span>
              </button>

              {/* Option to disconnect active account */}
              {activeAccount && (
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false)
                    if (confirm(t('header.accounts.removeActiveConfirm', { email: activeAccount.email }))) {
                      onRemoveAccount(activeAccount.id)
                    }
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-text-muted hover:text-text transition-colors"
                >
                  <TrashIcon className="w-3 h-3" />
                  <span>{t('header.accounts.disconnect')}</span>
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
