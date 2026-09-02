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
import { formatFolderName } from '../services/i18n'

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
    <aside className="w-56 shrink-0 border-r border-border bg-sidebar/40 p-3 flex flex-col justify-between select-none">
      <div className="space-y-4">
        {/* Compose Button */}
        <button
          type="button"
          onClick={onOpenCompose}
          className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl font-semibold text-xs bg-accent text-bg shadow-glass-sm hover:opacity-90 active:scale-95 transition-all"
        >
          <PencilSquareIcon className="w-4 h-4 stroke-2" />
          <span>Escrever E-mail</span>
        </button>

        {/* Folders List */}
        <div className="space-y-1">
          <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-text-muted block mb-1">
            Pastas
          </span>

          {folders.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-muted italic">Carregando pastas...</div>
          ) : (
            folders
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
              const displayName = formatFolderName(f.name, f.role)
              const isActive = activeFolder.toLowerCase() === f.path.toLowerCase()

              return (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => onSelectFolder(f.path)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-accent/10 text-accent font-semibold'
                      : 'text-text-muted hover:text-text hover:bg-input/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent' : 'text-text-muted'}`} />
                    <span className="truncate">{displayName}</span>
                  </div>

                  {f.unreadCount > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                        isActive ? 'bg-accent text-bg' : 'bg-input text-text-muted'
                      }`}
                    >
                      {f.unreadCount}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Storage and status footer */}
      <div className="pt-3 border-t border-border/60 text-[11px] text-text-muted px-2 flex items-center justify-between">
        <span>MomAI E-mails</span>
        <span className="font-mono opacity-70">v1.0</span>
      </div>
    </aside>
  )
}
