// src/components/EmailReader.tsx
// Reading pane with sanitized HTML (DOMPurify), attachments, action toolbar, and quick reply

import React, { useState } from 'react'
import {
  ArrowLeftIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  TrashIcon,
  EnvelopeIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  PaperAirplaneIcon,
  ShieldCheckIcon,
  FolderIcon,
  CheckCircleIcon,
  StarIcon as StarOutline
} from '@heroicons/react/24/outline'
import { StarIcon as StarSolid } from '@heroicons/react/24/solid'
import { EmailAvatar } from './EmailAvatar'
import { AttachmentBadge } from './AttachmentBadge'
import { EmailHtmlViewer } from './EmailHtmlViewer'
import { useExtensionLocale, formatFullDate, formatFolderName } from '../services/i18n'
import { hasReadableBody } from '../services/email-content'
import { isArchiveFolder, isSpamFolder, getMoveTargets } from '../services/folders'
import { starredToneClass } from '../services/starred-tone'
import type { EmailMessage, EmailAttachment, EmailFolder } from '../services/types'

const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g

const renderPlainTextWithLinks = (text: string) => {
  if (!text) return null
  const parts = text.split(URL_REGEX)
  return parts.map((part, index) => {
    if (URL_REGEX.test(part)) {
      return (
        <a
          key={index}
          href={part}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            window.open(part, '_blank', 'noopener,noreferrer')
          }}
          className="text-accent underline hover:opacity-80 break-all cursor-pointer font-medium"
        >
          {part}
        </a>
      )
    }
    return part
  })
}

interface EmailReaderProps {
  email: EmailMessage | null
  loading: boolean
  onBack: () => void
  onReply: (email: EmailMessage, replyAll?: boolean) => void
  onForward: (email: EmailMessage) => void
  onDelete: (id: string) => void
  onMarkUnread: (id: string) => void
  onQuickSendReply: (body: string) => Promise<boolean>
  onOpenAttachment?: (email: EmailMessage, attachment: EmailAttachment) => Promise<any> | void
  onSaveAttachment?: (email: EmailMessage, attachment: EmailAttachment) => Promise<any> | void
  activeFolder?: string
  folders?: EmailFolder[]
  onToggleStarred?: (id: string, currentStarred: boolean) => void
  onMove?: (id: string, toFolder: string) => void
  onNotSpam?: (id: string) => void
  onRestore?: (id: string) => void
}

export const EmailReader: React.FC<EmailReaderProps> = ({
  email,
  loading,
  onBack,
  onReply,
  onForward,
  onDelete,
  onMarkUnread,
  onQuickSendReply,
  onOpenAttachment,
  onSaveAttachment,
  activeFolder,
  folders,
  onToggleStarred,
  onMove,
  onNotSpam,
  onRestore
}) => {
  const [viewHtml, setViewHtml] = useState(true)
  const [quickReplyText, setQuickReplyText] = useState('')
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const [isMoving, setIsMoving] = useState(false)
  const { locale, t } = useExtensionLocale()

  // Instant open: with a message in hand (even header-only) the pane renders
  // immediately and only the body shows an inline loader. The full-screen
  // spinner stays for the case where there is nothing to show yet.
  if (!email) {
    if (loading) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-card text-text-muted p-8 space-y-3">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">{t('reader.loading')}</span>
        </div>
      )
    }
    return (
      <div className="flex-1 flex items-center justify-center bg-card text-text-muted p-8 text-xs">
        {t('reader.empty')}
      </div>
    )
  }

  const handleQuickReply = () => {
    const body = quickReplyText
    if (!body.trim()) return
    setQuickReplyText('')
    void Promise.resolve()
      .then(() => onQuickSendReply(body))
      .then((ok) => {
        if (!ok) setQuickReplyText(body)
      })
      .catch(() => {
        setQuickReplyText(body)
      })
  }

  const currentFolder = email.folder || activeFolder || 'INBOX'
  const currentFolderRole = folders?.find(
    (folder) => folder.path.toLowerCase() === currentFolder.toLowerCase()
  )?.role
  const showNotSpam = isSpamFolder(currentFolder, currentFolderRole) && Boolean(onNotSpam)
  const showingArchive = isArchiveFolder(currentFolder, currentFolderRole) && Boolean(onRestore)
  const moveTargets = folders ? getMoveTargets(folders, currentFolder) : []
  const canMove = Boolean(onMove) && moveTargets.length > 0
  const favoriteLabel = email.starred ? t('reader.unfavorite') : t('reader.favorite')

  const handleNotSpam = () => {
    if (!onNotSpam || isMoving) return
    setIsMoving(true)
    onNotSpam(email.id)
  }

  const handleMoveSelect = (toFolder: string) => {
    if (!onMove || isMoving) return
    setShowMoveMenu(false)
    setIsMoving(true)
    onMove(email.id, toFolder)
  }

  const initial = (email.from.name || email.from.address || '?').charAt(0).toUpperCase()

  return (
    <div className="flex-1 flex flex-col bg-card overflow-hidden">
      {/* Action Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-sidebar/30">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text transition-colors mr-2"
            title={t('reader.back')}
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onReply(email, false)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text text-xs font-medium transition-colors"
            title={t('reader.reply')}
          >
            <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
            <span>{t('reader.reply')}</span>
          </button>

          <button
            type="button"
            onClick={() => onForward(email)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text text-xs font-medium transition-colors"
            title={t('reader.forward')}
          >
            <ArrowUturnRightIcon className="w-3.5 h-3.5" />
            <span>{t('reader.forward')}</span>
          </button>

          {onToggleStarred && (
            <button
              type="button"
              onClick={() => onToggleStarred(email.id, email.starred)}
              className="p-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text transition-colors"
              title={favoriteLabel}
            >
              {email.starred ? (
                <StarSolid className={`w-4 h-4 ${starredToneClass(email.starred)}`} />
              ) : (
                <StarOutline className="w-4 h-4" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => onMarkUnread(email.id)}
            className="p-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text transition-colors"
            title={t('reader.markUnread')}
          >
            <EnvelopeIcon className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onDelete(email.id)}
            className="p-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text transition-colors"
            title={t('reader.delete')}
          >
            <TrashIcon className="w-4 h-4" />
          </button>

          {showingArchive && (
            <button
              type="button"
              onClick={() => onRestore?.(email.id)}
              className="p-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text transition-colors"
              title={t('reader.restore')}
            >
              <ArrowUturnLeftIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Format toggle button */}
        {email.html && (
          <button
            type="button"
            onClick={() => setViewHtml(!viewHtml)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-input/40 hover:bg-input border border-border text-xs text-text-muted hover:text-text transition-colors"
            title={t('reader.toggleView')}
          >
            {viewHtml ? (
              <>
                <DocumentTextIcon className="w-3.5 h-3.5" />
                <span>{t('reader.viewText')}</span>
              </>
            ) : (
              <>
                <CodeBracketIcon className="w-3.5 h-3.5" />
                <span>{t('reader.viewFormatted')}</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Main Email View */}
      <div className="flex-1 overflow-y-auto py-4 sm:py-6 px-6 sm:px-10 space-y-6 border-l border-border min-w-0 max-w-full">
        {/* Subject Header */}
        <div className="space-y-3">
          <h1 className="text-xl font-bold text-text leading-tight">{email.subject || t('reader.noSubject')}</h1>

          {/* Sender & Recipient Card */}
          <div className="flex items-start justify-between gap-4 pt-1">
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <EmailAvatar
                name={email.from.name}
                address={email.from.address}
                size="lg"
                className="w-10 h-10 shadow-xs"
              />

              {/* Names & Addresses */}
              <div className="space-y-0.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-text text-sm">{email.from.name || email.from.address}</span>
                  <span className="text-text-muted text-[11px]">&lt;{email.from.address}&gt;</span>
                </div>
                <div className="text-text-muted text-[11px]">
                  <span>{t('reader.to')}: {email.to.map((r) => r.name || r.address).join(', ')}</span>
                  {email.cc && email.cc.length > 0 && (
                    <span className="ml-2">cc: {email.cc.map((c) => c.name || c.address).join(', ')}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Date */}
            <span className="text-[11px] text-text-muted font-mono whitespace-nowrap shrink-0">
              {formatFullDate(email.timestamp, locale)}
            </span>
          </div>
        </div>

        <div className="border-t border-border/50" />

        {/* Email Body Content */}
        <div className="text-xs text-text leading-relaxed">
          {viewHtml && email.html ? (
            <EmailHtmlViewer html={email.html} />
          ) : loading && !hasReadableBody(email) ? (
            <div className="w-full max-w-[720px] mx-auto p-4 rounded-xl bg-card border border-border/60 space-y-2">
              <div className="flex items-center gap-2 text-text-muted">
                <div className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-[11px]">{t('reader.loading')}</span>
              </div>
              <div className="h-3 rounded bg-input w-11/12" />
              <div className="h-3 rounded bg-input w-full" />
              <div className="h-3 rounded bg-input w-4/5" />
              <div className="h-3 rounded bg-input w-3/5" />
            </div>
          ) : (
            <div className="w-full max-w-[720px] mx-auto p-4 rounded-xl bg-card border border-border/60 font-sans whitespace-pre-wrap leading-relaxed text-text/90 break-words">
              {renderPlainTextWithLinks(email.text || email.snippet || t('reader.emptyBody'))}
            </div>
          )}
        </div>

        {/* Attachments Section (Gmail style) */}
        {email.attachments && email.attachments.length > 0 && (
          <div className="space-y-3.5 pt-6 border-t border-border/80">
            {/* Header: "1 anexo • Verificado por MomAI" */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-text">
                <span className="font-semibold text-sm">
                  {email.attachments.length === 1
                    ? t('reader.attachments.one')
                    : t('reader.attachments.many', { count: email.attachments.length })}
                </span>
                <span className="text-text-muted">•</span>
                <div className="flex items-center gap-1.5 text-text-muted text-xs">
                  <ShieldCheckIcon className="w-4 h-4 text-emerald-500" />
                  <span>{t('reader.attachments.verified')}</span>
                </div>
              </div>

              {email.attachments.length > 1 && onOpenAttachment && (
                <button
                  type="button"
                  onClick={() => {
                    if (email.attachments && email.attachments.length > 0) {
                      onOpenAttachment(email, email.attachments[0])
                    }
                  }}
                  className="text-xs text-text-muted hover:text-accent font-medium transition-colors"
                >
                  {t('reader.attachments.openDocument')}
                </button>
              )}
            </div>

            {/* Attachments Cards Grid with Realistic Previews */}
            <div className="flex items-start gap-4 flex-wrap">
              {email.attachments.map((att, idx) => (
                <AttachmentBadge
                  key={idx}
                  attachment={att}
                  variant="card"
                  messageId={email.id}
                  folder={email.folder}
                  onOpen={onOpenAttachment ? () => onOpenAttachment(email, att) : undefined}
                  onSave={onSaveAttachment ? () => onSaveAttachment(email, att) : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* Action Pills: Responder, Favoritar, Mover e Não é spam */}
        <div className="flex items-center gap-2.5 pt-4 flex-wrap">
          <button
            type="button"
            onClick={() => onReply(email, false)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-border/80 hover:border-accent/60 bg-input/40 hover:bg-input text-xs font-semibold text-text transition-all cursor-pointer shadow-xs"
          >
            <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
            <span>{t('reader.reply')}</span>
          </button>
          <button
            type="button"
            onClick={() => onForward(email)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-border/80 hover:border-accent/60 bg-input/40 hover:bg-input text-xs font-semibold text-text transition-all cursor-pointer shadow-xs"
          >
            <ArrowUturnRightIcon className="w-3.5 h-3.5" />
            <span>{t('reader.forward')}</span>
          </button>
          {onToggleStarred && (
            <button
              type="button"
              onClick={() => onToggleStarred(email.id, email.starred)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-border/80 hover:border-accent/60 bg-input/40 hover:bg-input text-xs font-semibold text-text transition-all cursor-pointer shadow-xs"
              title={favoriteLabel}
            >
              {email.starred ? (
                <StarSolid className={`w-3.5 h-3.5 ${starredToneClass(email.starred)}`} />
              ) : (
                <StarOutline className="w-3.5 h-3.5" />
              )}
              <span>{favoriteLabel}</span>
            </button>
          )}
          {canMove && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMoveMenu((prev) => !prev)}
                disabled={isMoving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-border/80 hover:border-accent/60 bg-input/40 hover:bg-input text-xs font-semibold text-text transition-all cursor-pointer shadow-xs disabled:opacity-50"
                title={t('reader.move')}
              >
                <FolderIcon className="w-3.5 h-3.5" />
                <span>{isMoving ? t('reader.moving') : t('reader.move')}</span>
              </button>
              {showMoveMenu && (
                <div className="absolute left-0 bottom-full mb-2 min-w-44 max-h-56 overflow-y-auto rounded-lg border border-border bg-card shadow-xl p-1 z-20">
                  <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    {t('reader.moveTitle')}
                  </div>
                  {moveTargets.map((folder) => (
                    <button
                      key={folder.path}
                      type="button"
                      onClick={() => handleMoveSelect(folder.path)}
                      className="w-full text-left px-2.5 py-1.5 rounded-md text-xs text-text hover:bg-input transition-colors"
                    >
                      {formatFolderName(folder.name, folder.role, locale)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {showNotSpam && (
            <button
              type="button"
              onClick={handleNotSpam}
              disabled={isMoving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-accent/50 bg-accent/10 hover:bg-accent/20 text-xs font-semibold text-accent transition-all cursor-pointer shadow-xs disabled:opacity-50"
              title={t('reader.notSpam')}
            >
              <CheckCircleIcon className="w-3.5 h-3.5" />
              <span>{isMoving ? t('reader.unspamming') : t('reader.notSpam')}</span>
            </button>
          )}
        </div>

        {/* Quick Reply Box */}
        <div className="pt-4 border-t border-border space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-text">
            <ArrowUturnLeftIcon className="w-4 h-4 text-accent" />
            <span>{t('reader.quickReply')}</span>
          </div>

          <textarea
            rows={3}
            value={quickReplyText}
            onChange={(e) => setQuickReplyText(e.target.value)}
            placeholder={t('reader.quickReply.placeholder', { name: email.from.name || email.from.address })}
            className="w-full p-3 rounded-lg bg-input border border-border text-xs text-text placeholder:text-text-muted outline-none focus:outline-none focus:border-accent resize-y"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleQuickReply}
              disabled={!quickReplyText.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-bg font-semibold text-xs hover:opacity-90 transition-opacity disabled:opacity-50 shadow-sm"
            >
              <PaperAirplaneIcon className="w-3.5 h-3.5" />
              <span>{t('reader.quickReply.send')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
