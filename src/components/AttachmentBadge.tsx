// src/components/AttachmentBadge.tsx
// Renders interactive document attachment chips (Gmail-style) and detailed cards with OS-native launch support
// Incorporates official colored file type icons and realistic document thumbnail previews

import React, { useState } from 'react'
import {
  ArrowTopRightOnSquareIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  CheckIcon
} from '@heroicons/react/24/outline'
import type { EmailAttachment } from '../services/types'
import { renderPdfFirstPageToDataUrl } from '../services/pdf-preview'
import { emailApi } from '../services/api'
import {
  PdfFileIcon,
  WordFileIcon,
  ExcelFileIcon,
  PowerPointFileIcon,
  ImageFileIcon,
  ArchiveFileIcon,
  TextFileIcon,
  GenericFileIcon
} from './DocumentIcons'

export type FileCategory = 'pdf' | 'word' | 'excel' | 'powerpoint' | 'image' | 'archive' | 'audio' | 'video' | 'code' | 'generic'

export interface AttachmentFileInfo {
  category: FileCategory
  label: string
  extension: string
}

export function getAttachmentFileInfo(filename = '', contentType = ''): AttachmentFileInfo {
  const cleanName = filename.trim().toLowerCase()
  const cleanMime = contentType.trim().toLowerCase()

  const extMatch = cleanName.match(/\.([a-z0-9]+)$/)
  const extension = extMatch ? extMatch[1] : ''

  if (extension === 'pdf' || cleanMime.includes('pdf')) {
    return { category: 'pdf', label: 'PDF', extension: 'pdf' }
  }

  if (['doc', 'docx', 'rtf', 'odt', 'dotx'].includes(extension) || cleanMime.includes('word') || cleanMime.includes('officedocument.wordprocessingml')) {
    return { category: 'word', label: extension.toUpperCase() || 'DOC', extension: extension || 'doc' }
  }

  if (['xls', 'xlsx', 'csv', 'ods', 'tsv', 'xltx'].includes(extension) || cleanMime.includes('excel') || cleanMime.includes('spreadsheet') || cleanMime.includes('csv')) {
    return { category: 'excel', label: extension.toUpperCase() || 'XLS', extension: extension || 'xls' }
  }

  if (['ppt', 'pptx', 'odp', 'pps'].includes(extension) || cleanMime.includes('presentation') || cleanMime.includes('powerpoint')) {
    return { category: 'powerpoint', label: extension.toUpperCase() || 'PPT', extension: extension || 'ppt' }
  }

  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico', 'tiff'].includes(extension) || cleanMime.startsWith('image/')) {
    return { category: 'image', label: extension.toUpperCase() || 'IMG', extension: extension || 'img' }
  }

  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(extension) || cleanMime.includes('zip') || cleanMime.includes('compressed') || cleanMime.includes('archive')) {
    return { category: 'archive', label: extension.toUpperCase() || 'ZIP', extension: extension || 'zip' }
  }

  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(extension) || cleanMime.startsWith('audio/')) {
    return { category: 'audio', label: extension.toUpperCase() || 'AUDIO', extension: extension || 'audio' }
  }

  if (['mp4', 'mkv', 'mov', 'webm', 'avi'].includes(extension) || cleanMime.startsWith('video/')) {
    return { category: 'video', label: extension.toUpperCase() || 'VIDEO', extension: extension || 'video' }
  }

  if (['txt', 'json', 'js', 'ts', 'tsx', 'jsx', 'py', 'html', 'css', 'xml', 'md', 'yml', 'yaml', 'sh'].includes(extension)) {
    return { category: 'code', label: extension.toUpperCase() || 'TXT', extension: extension || 'txt' }
  }

  return { category: 'generic', label: extension.toUpperCase() || 'ARQ', extension: extension || 'dat' }
}

export function formatFileSize(bytes = 0): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Returns the official colorful brand icon according to the file category
 */
export const OfficialFileIcon: React.FC<{ category: FileCategory; className?: string }> = ({
  category,
  className = 'w-4 h-4'
}) => {
  switch (category) {
    case 'pdf':
      return <PdfFileIcon className={className} />
    case 'word':
      return <WordFileIcon className={className} />
    case 'excel':
      return <ExcelFileIcon className={className} />
    case 'powerpoint':
      return <PowerPointFileIcon className={className} />
    case 'image':
      return <ImageFileIcon className={className} />
    case 'archive':
      return <ArchiveFileIcon className={className} />
    case 'code':
      return <TextFileIcon className={className} />
    default:
      return <GenericFileIcon className={className} />
  }
}

interface AttachmentBadgeProps {
  attachment: EmailAttachment
  variant?: 'chip' | 'card'
  messageId?: string | number
  folder?: string
  accountId?: string
  onOpen?: (attachment: EmailAttachment) => Promise<any> | void
  onSave?: (attachment: EmailAttachment) => Promise<any> | void
  className?: string
}

export const AttachmentBadge: React.FC<AttachmentBadgeProps> = ({
  attachment,
  variant = 'chip',
  messageId,
  folder,
  accountId,
  onOpen,
  onSave,
  className = ''
}) => {
  const [opening, setOpening] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [realThumbnail, setRealThumbnail] = useState<string | null>(attachment.previewDataUrl || null)
  const [renderingThumb, setRenderingThumb] = useState(false)
  const fileInfo = getAttachmentFileInfo(attachment.filename, attachment.contentType)

  React.useEffect(() => {
    if (attachment.previewDataUrl) {
      setRealThumbnail(attachment.previewDataUrl)
      return
    }

    let isMounted = true

    // If document thumbnail is not yet in memory, fetch it on-demand from the backend
    const isDocWithPreview = ['pdf', 'word', 'excel', 'powerpoint', 'image'].includes(fileInfo.category)
    if (isDocWithPreview && messageId) {
      setRenderingThumb(true)
      emailApi
        .getAttachmentPreview({
          messageId,
          filename: attachment.filename,
          folder,
          accountId
        })
        .then((res) => {
          if (isMounted && res?.ok && res.previewDataUrl) {
            setRealThumbnail(res.previewDataUrl)
          }
        })
        .catch(() => {})
        .finally(() => {
          if (isMounted) setRenderingThumb(false)
        })
      return () => {
        isMounted = false
      }
    }

    if (fileInfo.category === 'pdf' && attachment.base64Data) {
      setRenderingThumb(true)
      renderPdfFirstPageToDataUrl(attachment.base64Data)
        .then((dataUrl) => {
          if (isMounted && dataUrl) {
            setRealThumbnail(dataUrl)
          }
        })
        .catch(() => {})
        .finally(() => {
          if (isMounted) setRenderingThumb(false)
        })
      return () => {
        isMounted = false
      }
    }
  }, [attachment.previewDataUrl, attachment.base64Data, fileInfo.category, messageId, folder, accountId])

  const handleClickOpen = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (opening || saving || !onOpen) return
    setOpening(true)
    try {
      await onOpen(attachment)
    } finally {
      setOpening(false)
    }
  }

  const handleClickSave = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (opening || saving || !onSave) return
    setSaving(true)
    try {
      const res: any = await onSave(attachment)
      if (res && res.ok && !res.cancelled) {
        setSavedSuccess(true)
        setTimeout(() => setSavedSuccess(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  // 1. CHIP VARIANT (for Email List inbox row, Gmail-style with original colored icon)
  if (variant === 'chip') {
    return (
      <button
        type="button"
        onClick={handleClickOpen}
        disabled={opening}
        title={`${attachment.filename} ${attachment.size ? `(${formatFileSize(attachment.size)})` : ''} — Clique para abrir no computador`}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-border/80 bg-input/50 hover:bg-input hover:border-accent/60 text-text transition-all shadow-xs group/att cursor-pointer max-w-[150px] shrink-0 select-none whitespace-nowrap overflow-hidden ${
          opening ? 'opacity-70 pointer-events-none' : ''
        } ${className}`}
      >
        {opening ? (
          <ArrowPathIcon className="w-3.5 h-3.5 animate-spin text-accent shrink-0" />
        ) : (
          <OfficialFileIcon category={fileInfo.category} className="w-3.5 h-3.5 shrink-0 drop-shadow-xs" />
        )}

        <span className="truncate text-[10px] font-medium text-text group-hover/att:text-accent transition-colors">
          {attachment.filename || 'Documento'}
        </span>

        {opening && (
          <span className="text-[9px] text-text-muted shrink-0">Abrindo...</span>
        )}
      </button>
    )
  }

  // 2. CARD VARIANT (for Email Reader pane, faithful to Gmail preview card)
  return (
    <div
      onClick={handleClickOpen}
      role="button"
      tabIndex={0}
      title="Clique para abrir com o aplicativo padrão do computador"
      className={`group/card w-52 sm:w-56 rounded-lg overflow-hidden border border-border/80 bg-card hover:border-accent/50 shadow-xs hover:shadow-md transition-all cursor-pointer select-none flex flex-col ${
        opening ? 'opacity-70 pointer-events-none' : ''
      } ${className}`}
    >
      {/* Upper Area: Realistic Document Thumbnail Preview */}
      <div className="h-28 sm:h-32 bg-[#F8F9FA] relative flex items-center justify-center p-2.5 overflow-hidden border-b border-border/50">
        {realThumbnail ? (
          /* Render REAL document thumbnail from PDF, Word, Excel or image */
          <div className="w-full h-full relative overflow-hidden flex items-start justify-center bg-white shadow-xs rounded-xs border border-gray-200">
            <img
              src={realThumbnail}
              alt={attachment.filename}
              className="w-full h-full object-cover object-top"
            />
            {/* Gmail folded corner for PDF, Word, Excel, PowerPoint */}
            {['pdf', 'word', 'excel', 'powerpoint'].includes(fileInfo.category) && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 overflow-hidden pointer-events-none">
                <div
                  className={`w-8 h-8 rotate-45 transform origin-bottom-right shadow-xs ${
                    fileInfo.category === 'word'
                      ? 'bg-[#185ABD]'
                      : fileInfo.category === 'excel'
                        ? 'bg-[#107C41]'
                        : fileInfo.category === 'powerpoint'
                          ? 'bg-[#C43E1C]'
                          : 'bg-[#EA4335]'
                  }`}
                />
              </div>
            )}
          </div>
        ) : renderingThumb ? (
          <div className="flex flex-col items-center justify-center gap-1.5 text-slate-500">
            <ArrowPathIcon className="w-5 h-5 animate-spin text-accent" />
            <span className="text-[10px] font-medium">Carregando prévia...</span>
          </div>
        ) : fileInfo.category === 'pdf' ? (
          /* PDF Page Document Fallback */
          <div className="w-full h-full bg-white shadow-xs rounded-sm p-2 flex flex-col justify-between relative overflow-hidden border border-gray-200">
            {/* Header: Photo avatar & Title lines */}
            <div className="flex items-start gap-2">
              <div className="w-6 h-7 bg-slate-300 rounded-xs shrink-0 flex items-center justify-center overflow-hidden border border-slate-400">
                <div className="w-3 h-3 bg-slate-500 rounded-full mt-1" />
              </div>
              <div className="flex-1 space-y-1 py-0.5">
                <div className="h-1.5 bg-slate-800 rounded-xs w-3/4" />
                <div className="h-1 bg-blue-500 rounded-xs w-1/2" />
                <div className="h-1 bg-slate-300 rounded-xs w-2/3" />
              </div>
            </div>

            {/* Content paragraph lines */}
            <div className="space-y-1.5 my-1">
              <div className="h-1 bg-slate-700 rounded-xs w-1/4" />
              <div className="space-y-1">
                <div className="h-1 bg-slate-200 rounded-xs w-full" />
                <div className="h-1 bg-slate-200 rounded-xs w-11/12" />
                <div className="h-1 bg-slate-200 rounded-xs w-4/5" />
              </div>
            </div>

            {/* Bottom section line */}
            <div className="space-y-1">
              <div className="h-1 bg-slate-700 rounded-xs w-1/3" />
              <div className="h-1 bg-slate-200 rounded-xs w-3/4" />
            </div>

            {/* Gmail folded red bottom-right corner */}
            <div className="absolute -bottom-1 -right-1 w-6 h-6 overflow-hidden">
              <div className="w-8 h-8 bg-[#EA4335] rotate-45 transform origin-bottom-right shadow-xs" />
            </div>
          </div>
        ) : fileInfo.category === 'word' ? (
          /* Word Document Simulation */
          <div className="w-full h-full bg-white shadow-xs rounded-sm p-2 flex flex-col justify-between relative overflow-hidden border border-gray-200">
            <div className="space-y-1.5">
              <div className="h-2 bg-[#185ABD] rounded-xs w-2/3" />
              <div className="h-1 bg-slate-400 rounded-xs w-1/3" />
            </div>
            <div className="space-y-1 my-1">
              <div className="h-1 bg-slate-200 rounded-xs w-full" />
              <div className="h-1 bg-slate-200 rounded-xs w-full" />
              <div className="h-1 bg-slate-200 rounded-xs w-5/6" />
              <div className="h-1 bg-slate-200 rounded-xs w-3/4" />
            </div>
            <div className="space-y-1">
              <div className="h-1.5 bg-slate-400 rounded-xs w-1/2" />
              <div className="h-1 bg-slate-200 rounded-xs w-4/5" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 overflow-hidden">
              <div className="w-8 h-8 bg-[#185ABD] rotate-45 transform origin-bottom-right shadow-xs" />
            </div>
          </div>
        ) : fileInfo.category === 'excel' ? (
          /* Excel Spreadsheet Simulation */
          <div className="w-full h-full bg-white shadow-xs rounded-sm p-1.5 flex flex-col justify-between relative overflow-hidden border border-gray-200">
            <div className="grid grid-cols-4 gap-0.5 bg-[#107C41]/20 p-0.5 rounded-xs">
              <div className="h-2 bg-[#107C41] rounded-xs" />
              <div className="h-2 bg-[#107C41]/80 rounded-xs" />
              <div className="h-2 bg-[#107C41]/80 rounded-xs" />
              <div className="h-2 bg-[#107C41]/80 rounded-xs" />
            </div>
            <div className="grid grid-cols-4 gap-0.5 flex-1 my-1">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="h-2.5 bg-slate-100 border border-slate-200 rounded-xs flex items-center justify-center">
                  <div className="h-1 bg-slate-400 rounded-xs w-2/3" />
                </div>
              ))}
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 overflow-hidden">
              <div className="w-8 h-8 bg-[#107C41] rotate-45 transform origin-bottom-right shadow-xs" />
            </div>
          </div>
        ) : (
          /* General Document / Image Preview */
          <div className="flex flex-col items-center justify-center space-y-1.5">
            <OfficialFileIcon category={fileInfo.category} className="w-10 h-10 drop-shadow-sm" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {fileInfo.label}
            </span>
          </div>
        )}

        {/* Hover Overlay with Action Buttons (Gmail style: Abrir e Fazer Download) */}
        <div className="absolute inset-0 bg-black/45 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center p-2 z-10">
          {opening ? (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white text-slate-900 text-xs font-semibold shadow-lg">
              <ArrowPathIcon className="w-4 h-4 animate-spin text-accent" />
              <span>Abrindo no computador...</span>
            </div>
          ) : savedSuccess ? (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold shadow-lg">
              <CheckIcon className="w-4 h-4 stroke-2" />
              <span>Salvo com sucesso!</span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {/* Botão 1: Abrir no computador */}
              {onOpen && (
                <button
                  type="button"
                  onClick={handleClickOpen}
                  className="w-10 h-10 rounded-full bg-white/95 hover:bg-white text-slate-800 flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                  title="Abrir com o aplicativo padrão do computador"
                >
                  <ArrowTopRightOnSquareIcon className="w-5 h-5 text-slate-800 stroke-2" />
                </button>
              )}

              {/* Botão 2: Fazer download / Salvar como... */}
              {onSave && (
                <button
                  type="button"
                  onClick={handleClickSave}
                  className="w-10 h-10 rounded-full bg-white/95 hover:bg-white text-slate-800 flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                  title="Fazer download / Salvar como..."
                >
                  <ArrowDownTrayIcon className="w-5 h-5 text-slate-800 stroke-2" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lower Area: Document Footer with Original Colored Icon, Name & Folded Corner */}
      <div className="px-3 py-2 bg-card flex items-center justify-between gap-2 border-t border-border/30">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Official brand icon */}
          <OfficialFileIcon category={fileInfo.category} className="w-4 h-4 shrink-0 drop-shadow-xs" />
          <span
            className="text-xs font-medium text-text truncate block group-hover/card:text-accent transition-colors"
            title={attachment.filename}
          >
            {attachment.filename || 'Documento'}
          </span>
        </div>

        {/* Size Badge & Quick Save Button */}
        <div className="shrink-0 flex items-center gap-1.5">
          {attachment.size > 0 && (
            <span className="text-[10px] text-text-muted font-mono whitespace-nowrap">
              {formatFileSize(attachment.size)}
            </span>
          )}

          {onSave && (
            <button
              type="button"
              onClick={handleClickSave}
              disabled={saving}
              title="Salvar como..."
              className="p-1 rounded-md hover:bg-input text-text-muted hover:text-accent transition-colors cursor-pointer"
            >
              {savedSuccess ? (
                <CheckIcon className="w-3.5 h-3.5 text-emerald-500 stroke-2" />
              ) : (
                <ArrowDownTrayIcon className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
