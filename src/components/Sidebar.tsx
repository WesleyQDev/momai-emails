// src/components/Sidebar.tsx
// Sidebar with folders, compose button, and folder unread badges

import React from 'react'
import {
  PencilSquareIcon,
  InboxIcon,
  PaperAirplaneIcon,
  DocumentDuplicateIcon,
  TrashIcon,
  ArchiveBoxIcon,
  StarIcon,
  ExclamationCircleIcon,
  FolderIcon
} from '@heroicons/react/24/outline'
import type { EmailFolder } from '../services/types'
import { formatFolderName, useExtensionLocale } from '../services/i18n'
import { mergeWithDefaultFolders } from '../services/folders'
import { getFolderDisplayUnread } from '../services/unread-today'

interface SidebarProps {
  folders: EmailFolder[]
  activeFolder: string
  onSelectFolder: (folderPath: string) => void
  onOpenCompose: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  folders,
  activeFolder,
  onSelectFolder,
  onOpenCompose
}) => {
  const { locale, t } = useExtensionLocale()
  const displayFolders = mergeWithDefaultFolders(folders)
  const getFolderIcon = (role?: string, name?: string) => {
    const clean = (name || '').toLowerCase()
    if (clean.includes('starred') || clean.includes('estrela') || role === 'starred') return StarIcon
    if (clean.includes('important') || clean.includes('importante') || role === 'important') return ExclamationCircleIcon
    if (clean.includes('all mail') || clean.includes('todos') || role === 'all') return ArchiveBoxIcon
    if (clean.includes('sent') || clean.includes('enviad') || role === 'sent') return PaperAirplaneIcon
    if (clean.includes('draft') || clean.includes('rascunh') || role === 'drafts') return DocumentDuplicateIcon
    if (clean.includes('trash') || clean.includes('lixeir') || role === 'trash') return TrashIcon
    if (clean.includes('junk') || clean.includes('spam') || role === 'junk') return ExclamationCircleIcon
    if (clean.includes('archive') || clean.includes('arquivo') || role === 'archive') return ArchiveBoxIcon
    if (clean.includes('inbox') || role === 'inbox') return InboxIcon

    switch (role) {
      case 'inbox':
        return InboxIcon
      case 'sent':
        return PaperAirplaneIcon
      case 'drafts':
        return DocumentDuplicateIcon
      case 'trash':
        return TrashIcon
      case 'junk':
        return ExclamationCircleIcon
      case 'archive':
        return ArchiveBoxIcon
      case 'starred':
        return StarIcon
      default:
        return FolderIcon
    }
  }

  return (
    <aside className="w-48 shrink-0 bg-sidebar/40 px-2.5 py-3 flex flex-col select-none">
      <div className="space-y-4">
        {/* Compose Button (Gmail Material 3 style) */}
        <button
          type="button"
          onClick={onOpenCompose}
          style={{ backgroundColor: '#C2E7FF', color: '#001d35' }}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-2xl font-semibold text-xs hover:opacity-90 active:scale-95 transition-all shadow-xs"
        >
          <PencilSquareIcon className="w-4 h-4 stroke-2 shrink-0" style={{ color: '#001d35' }} />
          <span style={{ color: '#001d35' }}>{t('sidebar.compose')}</span>
        </button>

        {/* Folders List */}
        <div className="space-y-1">
          <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-text-muted block mb-1">
            {t('sidebar.folders')}
          </span>

          {displayFolders
            .filter((f) => {
              // Hide "All Mail" / "Todos os E-mails" folder
              const lower = f.name.toLowerCase().replace(/^\[gmail\]\/?/i, '').trim()
              const pathLower = f.path.toLowerCase().replace(/^\[gmail\]\/?/i, '').trim()
              if (
                f.role === 'all' ||
                lower === 'all mail' ||
                lower === 'todos os e-mails' ||
                lower === 'todos os emails' ||
                lower === 'all' ||
                pathLower.includes('all mail') ||
                pathLower.includes('todos os e-mails') ||
                pathLower.includes('todos os emails')
              ) {
                return false
              }
              return true
            })
            .map((f) => {
              const Icon = getFolderIcon(f.role, f.name)
              const displayName = formatFolderName(f.name, f.role, locale)
              const isActive = activeFolder.toLowerCase() === f.path.toLowerCase()
              const displayUnread = getFolderDisplayUnread(f)

              return (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => onSelectFolder(f.path)}
                  style={isActive ? { backgroundColor: '#D3E3FD', color: '#001d35' } : undefined}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-full text-xs font-medium transition-colors ${
                    isActive
                      ? 'font-bold'
                      : 'text-text-muted hover:text-text hover:bg-input/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${isActive ? 'stroke-2' : 'text-text-muted'}`}
                      style={isActive ? { color: '#0b57d0' } : undefined}
                    />
                    <span
                      className={`truncate ${isActive ? 'font-bold' : ''}`}
                      style={isActive ? { color: '#001d35' } : undefined}
                    >
                      {displayName}
                    </span>
                  </div>

                  {displayUnread > 0 && (
                    <span
                      className={`text-xs font-bold shrink-0 ${
                        isActive ? '' : 'text-text-muted'
                      }`}
                      style={isActive ? { color: '#001d35' } : undefined}
                    >
                      {displayUnread.toLocaleString(locale)}
                    </span>
                  )}
                </button>
              )
            })}
        </div>
      </div>
    </aside>
  )
}
