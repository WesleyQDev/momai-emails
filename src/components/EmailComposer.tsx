// src/components/EmailComposer.tsx
// Floating compose window following Gmail UX style:
// - Drag & drop images/files -> goes to Attachment Tray
// - Right click -> Colar (or Ctrl+V) -> inserts image INLINE into message content
// - Select inline image + Delete / Backspace -> removes the selected image

import React, { useState, useEffect, useRef } from 'react'
import {
  XMarkIcon,
  MinusIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  PaperAirplaneIcon,
  PaperClipIcon,
  PhotoIcon,
  TrashIcon,
  UserIcon,
  ArrowUpTrayIcon,
  EyeIcon
} from '@heroicons/react/24/outline'
import type { PublicEmailAccount, SendEmailPayload, OutgoingAttachment } from '../services/types'
import sdk from 'momai:sdk'
import ContextMenu from './ContextMenu'
import { useExtensionLocale } from '../services/i18n'
import { OfficialFileIcon, formatFileSize, getAttachmentFileInfo } from './AttachmentBadge'

interface EmailComposerProps {
  isOpen: boolean
  accounts: PublicEmailAccount[]
  activeAccountId: string | null
  initialData?: Partial<SendEmailPayload>
  onClose: () => void
  onSend: (payload: SendEmailPayload) => Promise<{ ok: boolean; error?: string }>
}

interface RecipientItem {
  email: string
  name?: string
  lastUsed: number
}

const RECIPIENTS_KEY = 'momai_emails_recent_recipients_v1'

function getRecentRecipients(): RecipientItem[] {
  try {
    const raw = localStorage.getItem(RECIPIENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveRecipient(email: string, name?: string): RecipientItem[] {
  try {
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !cleanEmail.includes('@')) return getRecentRecipients()
    const existing = getRecentRecipients()
    const filtered = existing.filter((r) => r.email.toLowerCase() !== cleanEmail)
    const updated = [{ email: cleanEmail, name: name?.trim(), lastUsed: Date.now() }, ...filtered].slice(0, 20)
    localStorage.setItem(RECIPIENTS_KEY, JSON.stringify(updated))
    return updated
  } catch {
    return []
  }
}

function deleteRecipient(email: string): RecipientItem[] {
  try {
    const existing = getRecentRecipients()
    const updated = existing.filter((r) => r.email.toLowerCase() !== email.toLowerCase())
    localStorage.setItem(RECIPIENTS_KEY, JSON.stringify(updated))
    return updated
  } catch {
    return []
  }
}

function extractImageUrlsFromDataTransfer(dataTransfer: DataTransfer): string[] {
  const urls: string[] = []

  // 1. Check HTML snippet
  const html = dataTransfer.getData('text/html')
  if (html) {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      const imgs = doc.querySelectorAll('img')
      imgs.forEach((img) => {
        const src = img.getAttribute('src')
        if (src && !src.startsWith('data:image/svg+xml;base64,PHN2Zy')) {
          urls.push(src)
        }
      })
    } catch {
      // ignore
    }
  }

  // 2. Check uri-list and text/plain
  const uriList = dataTransfer.getData('text/uri-list')
  const plainText = dataTransfer.getData('text/plain')
  const candidates = [uriList, plainText].filter(Boolean)

  for (const text of candidates) {
    try {
      if (text.includes('mediaurl=') || text.includes('imgurl=') || text.includes('imgrefurl=')) {
        const matchBing = text.match(/[?&]mediaurl=([^&]+)/i)
        if (matchBing && matchBing[1]) {
          const decoded = decodeURIComponent(matchBing[1])
          if (decoded && !urls.includes(decoded)) {
            urls.unshift(decoded)
          }
        }
        const matchGoogle = text.match(/[?&]imgurl=([^&]+)/i)
        if (matchGoogle && matchGoogle[1]) {
          const decoded = decodeURIComponent(matchGoogle[1])
          if (decoded && !urls.includes(decoded)) {
            urls.unshift(decoded)
          }
        }
      } else if (
        text.startsWith('http://') ||
        text.startsWith('https://') ||
        text.startsWith('data:image/') ||
        text.startsWith('blob:')
      ) {
        const isImageExt = /\.(png|jpe?g|webp|gif|svg|bmp|ico|avif)(\?.*)?$/i.test(text)
        if (isImageExt || text.startsWith('data:image/') || text.startsWith('blob:')) {
          if (!urls.includes(text)) {
            urls.push(text)
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return urls
}

export const EmailComposer: React.FC<EmailComposerProps> = ({
  isOpen,
  accounts,
  activeAccountId,
  initialData,
  onClose,
  onSend
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [isHtml, setIsHtml] = useState(false)
  const [attachments, setAttachments] = useState<OutgoingAttachment[]>([])

  const [isMinimized, setIsMinimized] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Drag-and-drop & attachment state
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isProcessingAttachments, setIsProcessingAttachments] = useState(false)
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null)
  const [selectedInlineImg, setSelectedInlineImg] = useState<HTMLImageElement | null>(null)
  const dragCounter = useRef(0)

  // Refs for editor and file inputs
  const editorRef = useRef<HTMLDivElement>(null)
  const savedSelectionRef = useRef<Range | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imageInputInlineRef = useRef<HTMLInputElement>(null)

  // Context menus
  const [bodyContextMenu, setBodyContextMenu] = useState<{ visible: boolean; x: number; y: number } | null>(null)
  const [recipientContextMenu, setRecipientContextMenu] = useState<{ visible: boolean; x: number; y: number; email: string } | null>(null)

  // Autocomplete state
  const [recentRecipients, setRecentRecipients] = useState<RecipientItem[]>([])
  const [showToAutofill, setShowToAutofill] = useState(false)
  const { t } = useExtensionLocale()
  const toInputRef = useRef<HTMLInputElement>(null)
  const toAutofillRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setSelectedAccountId(initialData?.accountId || activeAccountId || accounts[0]?.id || '')
      setTo(initialData?.to || '')
      setCc(initialData?.cc || '')
      setBcc(initialData?.bcc || '')
      setShowCc(Boolean(initialData?.cc))
      setShowBcc(Boolean(initialData?.bcc))
      setSubject(initialData?.subject || '')
      const initBody = initialData?.body || ''
      setBody(initBody)
      if (editorRef.current) {
        editorRef.current.innerHTML = initBody
      }
      setIsHtml(Boolean(initialData?.isHtml))
      setAttachments(initialData?.attachments || [])
      setError(null)
      setIsMinimized(false)
      setIsMaximized(false)
      setIsDraggingOver(false)
      setSelectedInlineImg(null)
      setRecentRecipients(getRecentRecipients())
    }
  }, [isOpen, initialData, activeAccountId, accounts])

  // Sync editor content when initialData changes
  useEffect(() => {
    if (editorRef.current && isOpen && body !== editorRef.current.innerHTML) {
      if (document.activeElement !== editorRef.current) {
        editorRef.current.innerHTML = body
      }
    }
  }, [body, isOpen])

  // Close autofill & context menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        toAutofillRef.current &&
        !toAutofillRef.current.contains(e.target as Node) &&
        toInputRef.current &&
        !toInputRef.current.contains(e.target as Node)
      ) {
        setShowToAutofill(false)
      }
      setRecipientContextMenu(null)
      setBodyContextMenu(null)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  if (!isOpen) return null

  // Selection helpers
  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange()
    }
  }

  const restoreSelection = () => {
    if (!editorRef.current) return
    editorRef.current.focus()
    if (savedSelectionRef.current) {
      const sel = window.getSelection()
      if (sel) {
        sel.removeAllRanges()
        sel.addRange(savedSelectionRef.current)
      }
    }
  }

  // Insert image directly INLINE into editor (used when pasting or inserting inline image)
  const insertInlineImage = (src: string, alt?: string) => {
    const finalAlt = alt || t('composer.imageAlt')
    if (!editorRef.current) return
    editorRef.current.focus()
    restoreSelection()

    const imgId = `img-inline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const imgHtml = `<img id="${imgId}" src="${src}" alt="${finalAlt}" tabIndex="0" class="momai-inline-img hover:opacity-95 transition-all cursor-pointer" style="max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0; display: block; box-shadow: 0 2px 8px rgba(0,0,0,0.15); outline: none;" />`

    document.execCommand('insertHTML', false, imgHtml)
    setIsHtml(true)
    setBody(editorRef.current.innerHTML)
  }

  // Read files and add as ATTACHMENT TRAY below
  const addFilesAsAttachments = async (files: FileList | File[]) => {
    setIsProcessingAttachments(true)
    const newAttachments: OutgoingAttachment[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        const att = await new Promise<OutgoingAttachment>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => {
            const base64Data = reader.result as string
            resolve({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              filename: file.name,
              contentType: file.type || 'application/octet-stream',
              size: file.size,
              previewUrl: file.type.startsWith('image/') ? base64Data : undefined,
              base64Data
            })
          }
          reader.onerror = () => {
            resolve({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              filename: file.name,
              contentType: file.type || 'application/octet-stream',
              size: file.size
            })
          }
          reader.readAsDataURL(file)
        })
        newAttachments.push(att)
      } catch (err) {
        console.error('[EmailComposer] Erro ao ler anexo de arquivo:', err)
      }
    }
    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments])
    }
    setIsProcessingAttachments(false)
  }

  // Convert web image URLs into ATTACHMENT TRAY below
  const addUrlsAsAttachments = async (urls: string[]) => {
    if (urls.length === 0) return
    setIsProcessingAttachments(true)
    const newAttachments: OutgoingAttachment[] = []

    for (const url of urls) {
      try {
        const cleanUrl = url.trim()
        let filename = 'imagem_anexa.png'
        try {
          const urlObj = new URL(cleanUrl)
          const pathname = urlObj.pathname
          const base = pathname.substring(pathname.lastIndexOf('/') + 1)
          if (base && base.includes('.')) {
            filename = decodeURIComponent(base)
          }
        } catch {
          // fallback
        }

        if (cleanUrl.startsWith('data:image/')) {
          const mimeMatch = cleanUrl.match(/^data:([^;]+);base64,/)
          const contentType = mimeMatch ? mimeMatch[1] : 'image/png'
          newAttachments.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            filename,
            contentType,
            size: Math.round((cleanUrl.length * 3) / 4),
            previewUrl: cleanUrl,
            base64Data: cleanUrl
          })
          continue
        }

        try {
          const res = await fetch(cleanUrl)
          const blob = await res.blob()
          const att = await new Promise<OutgoingAttachment>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => {
              const base64Data = reader.result as string
              resolve({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                filename,
                contentType: blob.type || 'image/png',
                size: blob.size,
                previewUrl: base64Data,
                base64Data
              })
            }
            reader.onerror = () => {
              resolve({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                filename,
                contentType: blob.type || 'image/png',
                size: blob.size,
                previewUrl: cleanUrl
              })
            }
            reader.readAsDataURL(blob)
          })
          newAttachments.push(att)
        } catch {
          newAttachments.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            filename,
            contentType: 'image/png',
            size: 0,
            previewUrl: cleanUrl
          })
        }
      } catch (err) {
        console.error('[EmailComposer] Erro ao processar anexo de imagem:', err)
      }
    }

    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments])
    }
    setIsProcessingAttachments(false)
  }

  // 1. DRAG & DROP -> MUST GO TO ATTACHMENT TRAY BELOW
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setIsDraggingOver(false)

    // A. Local files dropped -> Add to Attachment Tray
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await addFilesAsAttachments(e.dataTransfer.files)
      return
    }

    // B. Web images / links dragged -> Add to Attachment Tray
    const imageUrls = extractImageUrlsFromDataTransfer(e.dataTransfer)
    if (imageUrls.length > 0) {
      await addUrlsAsAttachments(imageUrls)
      return
    }

    // C. Fallback: plain text snippet
    const text = e.dataTransfer.getData('text/plain')
    if (text && editorRef.current) {
      editorRef.current.focus()
      document.execCommand('insertText', false, text)
      setBody(editorRef.current.innerHTML)
    }
  }

  // 2. CLIPBOARD PASTE (Ctrl+V) -> MUST PASTE INLINE INSIDE MESSAGE BODY
  const handlePaste = async (e: React.ClipboardEvent) => {
    // Check if clipboard contains image files
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      const filesArr = Array.from(e.clipboardData.files)
      const imageFiles = filesArr.filter((f) => f.type.startsWith('image/'))
      const otherFiles = filesArr.filter((f) => !f.type.startsWith('image/'))

      if (imageFiles.length > 0) {
        e.preventDefault()
        setIsProcessingAttachments(true)
        for (const file of imageFiles) {
          const reader = new FileReader()
          reader.onload = () => {
            if (reader.result) {
              insertInlineImage(reader.result as string, file.name)
            }
          }
          reader.readAsDataURL(file)
        }
        setIsProcessingAttachments(false)
      }

      if (otherFiles.length > 0) {
        e.preventDefault()
        await addFilesAsAttachments(otherFiles)
      }
      return
    }

    if (e.clipboardData.items) {
      const imageItems = Array.from(e.clipboardData.items).filter((item) =>
        item.type.startsWith('image/')
      )
      if (imageItems.length > 0) {
        e.preventDefault()
        setIsProcessingAttachments(true)
        for (const item of imageItems) {
          const file = item.getAsFile()
          if (file) {
            const reader = new FileReader()
            reader.onload = () => {
              if (reader.result) {
                insertInlineImage(reader.result as string, file.name)
              }
            }
            reader.readAsDataURL(file)
          }
        }
        setIsProcessingAttachments(false)
        return
      }
    }
  }

  // 3. RIGHT CLICK -> COLAR (Paste) -> MUST PASTE INLINE INSIDE MESSAGE BODY
  //
  // Why we use sdk.clipboard.read() (native Electron clipboard via SDK):
  // The Web Clipboard API (navigator.clipboard.read/readText) requires active
  // document focus AND a direct user gesture on the focused element. Clicking a
  // custom ContextMenu item loses focus, so the browser always throws DOMException.
  // Electron's native clipboard (wrapped by sdk.clipboard) has no such restriction.
  const handleContextMenuPaste = async () => {
    setBodyContextMenu(null)

    if (!editorRef.current) return
    editorRef.current.focus()
    restoreSelection()

    try {
      if (sdk?.clipboard && typeof sdk.clipboard.read === 'function') {
        const result = await sdk.clipboard.read()
        if (result && result.ok) {
          if (result.type === 'image' && result.dataUrl) {
            insertInlineImage(result.dataUrl)
            return
          }
          if (result.type === 'text' && result.text) {
            const trimmed = result.text.trim()
            // Check if the text is an image URL
            if (
              trimmed.startsWith('data:image/') ||
              /\.(png|jpe?g|webp|gif|svg|bmp|avif)(\?.*)?$/i.test(trimmed)
            ) {
              insertInlineImage(trimmed)
              return
            }
            // Otherwise insert as plain text
            document.execCommand('insertText', false, result.text)
            if (editorRef.current) setBody(editorRef.current.innerHTML)
            return
          }
        }
      }
    } catch (err) {
      console.warn('[EmailComposer] sdk.clipboard.read error:', err)
    }

    // Last resort fallback (only triggers outside Electron, e.g. pure browser dev)
    try {
      document.execCommand('paste')
      if (editorRef.current) setBody(editorRef.current.innerHTML)
    } catch {
      // nothing more we can do
    }
  }

  // 4. INLINE IMAGE CLICK SELECTION & DELETE / BACKSPACE HANDLING
  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target && target.tagName === 'IMG') {
      // Highlight selected image
      setSelectedInlineImg(target as HTMLImageElement)
      const imgs = editorRef.current?.querySelectorAll('img')
      imgs?.forEach((img) => {
        img.style.outline = 'none'
        img.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'
      })
      target.style.outline = '2px solid var(--accent, #6366f1)'
      target.style.boxShadow = '0 0 0 4px rgba(99,102,241,0.3)'
      target.focus()
    } else {
      // Clear image selection
      if (selectedInlineImg) {
        selectedInlineImg.style.outline = 'none'
        selectedInlineImg.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'
        setSelectedInlineImg(null)
      }
    }
  }

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // If an inline image is explicitly selected
      if (selectedInlineImg && selectedInlineImg.parentNode) {
        e.preventDefault()
        selectedInlineImg.remove()
        setSelectedInlineImg(null)
        if (editorRef.current) {
          setBody(editorRef.current.innerHTML)
        }
        return
      }

      // Check if current selection focus is an image node
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        const node = sel.anchorNode
        if (node) {
          let imgElem: HTMLImageElement | null = null
          if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'IMG') {
            imgElem = node as HTMLImageElement
          } else if (node.previousSibling && (node.previousSibling as HTMLElement).tagName === 'IMG') {
            imgElem = node.previousSibling as HTMLImageElement
          }
          if (imgElem) {
            e.preventDefault()
            imgElem.remove()
            setSelectedInlineImg(null)
            if (editorRef.current) {
              setBody(editorRef.current.innerHTML)
            }
            return
          }
        }
      }
    }
    saveSelection()
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingOver(true)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDraggingOver) {
      setIsDraggingOver(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDraggingOver(false)
    }
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id)
      if (target?.previewUrl && target.previewUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(target.previewUrl)
        } catch {}
      }
      return prev.filter((a) => a.id !== id)
    })
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!to.trim()) {
      setError(t('composer.errors.noRecipient'))
      return
    }

    const currentContent = editorRef.current ? editorRef.current.innerHTML : body
    if (!currentContent.trim() && attachments.length === 0) {
      setError(t('composer.errors.emptyBody'))
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await onSend({
        accountId: selectedAccountId,
        to: to.trim(),
        subject: subject.trim() || t('composer.defaultSubject'),
        body: currentContent,
        isHtml: isHtml || currentContent.includes('<img'),
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        inReplyTo: initialData?.inReplyTo,
        references: initialData?.references,
        attachments: attachments.length > 0 ? attachments : undefined
      })

      if (!res.ok) {
        setError(res.error || t('composer.errors.sendFailed'))
      } else {
        saveRecipient(to.trim())
        onClose()
      }
    } catch (err: any) {
      setError(err?.message || t('composer.errors.unexpected'))
    } finally {
      setLoading(false)
    }
  }

  const filteredRecipients = recentRecipients.filter((r) => {
    if (!to.trim()) return true
    const q = to.toLowerCase()
    return r.email.toLowerCase().includes(q) || (r.name && r.name.toLowerCase().includes(q))
  })

  const totalAttachmentsSize = attachments.reduce((sum, a) => sum + (a.size || 0), 0)

  return (
    <>
      {/* Backdrop overlay when maximized */}
      {isMaximized && (
        <div
          onClick={() => setIsMaximized(false)}
          className="fixed inset-0 bg-bg/40 backdrop-blur-xs z-40 transition-opacity animate-fade-in"
        />
      )}

      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`fixed z-50 bg-card border border-border shadow-glass-lg overflow-hidden flex flex-col transition-all duration-200 ${
          isMinimized
            ? 'top-auto left-auto translate-x-0 translate-y-0 bottom-0 right-2 w-64 h-11 rounded-t-xl'
            : isMaximized
              ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bottom-auto right-auto w-[1180px] max-w-[96vw] h-[880px] max-h-[95vh] rounded-2xl shadow-2xl animate-fade-in'
              : 'top-auto left-auto translate-x-0 translate-y-0 bottom-0 right-2 w-[370px] h-[500px] rounded-t-xl animate-slide-up'
        }`}
      >
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            addFilesAsAttachments(e.target.files)
            e.target.value = ''
          }
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            addFilesAsAttachments(e.target.files)
            e.target.value = ''
          }
        }}
      />
      <input
        ref={imageInputInlineRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0]
            const reader = new FileReader()
            reader.onload = () => {
              if (reader.result) {
                insertInlineImage(reader.result as string, file.name)
              }
            }
            reader.readAsDataURL(file)
            e.target.value = ''
          }
        }}
      />

      {/* Visual Drop Overlay (Drag to attach) */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-bg/90 backdrop-blur-xs border-2 border-dashed border-accent flex flex-col items-center justify-center gap-3 p-6 text-center animate-fade-in pointer-events-none">
          <div className="w-14 h-14 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent animate-pulse shadow-glass-sm">
            <ArrowUpTrayIcon className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text">{t('composer.dropTitle')}</p>
            <p className="text-xs text-text-muted mt-0.5">{t('composer.dropSubtitle')}</p>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-sidebar/90 border-b border-border select-none">
        <span className="text-xs font-semibold text-text truncate">
          {subject.trim() ? subject : t('composer.newMessage')}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              if (isMaximized) setIsMaximized(false)
              setIsMinimized(!isMinimized)
            }}
            className="p-1 rounded hover:bg-input text-text-muted hover:text-text transition-colors"
            title={isMinimized ? t('composer.restore') : t('composer.minimize')}
          >
            <MinusIcon className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (isMinimized) setIsMinimized(false)
              setIsMaximized(!isMaximized)
            }}
            className="p-1 rounded hover:bg-input text-text-muted hover:text-text transition-colors"
            title={isMaximized ? t('composer.restore') : t('composer.maximize')}
          >
            {isMaximized ? (
              <ArrowsPointingInIcon className="w-3.5 h-3.5" />
            ) : (
              <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-input text-text-muted hover:text-text transition-colors"
            title={t('composer.close')}
          >
            <XMarkIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body (hidden when minimized) */}
      {!isMinimized && (
        <form onSubmit={handleSend} className="flex-1 flex flex-col overflow-hidden text-xs">
          {/* Account Selector (From) */}
          <div className="flex items-center px-4 py-2 border-b border-border/40 gap-2 bg-input/10">
            <span className="text-text-muted font-medium w-12 shrink-0">{t('composer.from')}</span>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="flex-1 bg-transparent border-none text-text text-xs focus:outline-hidden cursor-pointer"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id} className="bg-card text-text">
                  {acc.name ? `${acc.name} <${acc.email}>` : acc.email}
                </option>
              ))}
            </select>
          </div>

          {/* To Field with Autocomplete */}
          <div className="flex items-center px-4 py-2 border-b border-border/40 gap-2 relative">
            <span className="text-text-muted font-medium w-12 shrink-0">{t('composer.to')}</span>
            <input
              ref={toInputRef}
              type="email"
              required
              autoComplete="off"
              value={to}
              onFocus={() => setShowToAutofill(true)}
              onChange={(e) => {
                setTo(e.target.value)
                setShowToAutofill(true)
              }}
              placeholder={t('composer.toPlaceholder')}
              className="flex-1 bg-transparent border-none text-text placeholder:text-text-muted focus:outline-hidden text-xs"
            />
            <div className="flex items-center gap-1 text-[11px] text-text-muted">
              {!showCc && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="hover:text-text hover:underline"
                >
                  Cc
                </button>
              )}
              {!showBcc && (
                <button
                  type="button"
                  onClick={() => setShowBcc(true)}
                  className="hover:text-text hover:underline ml-1"
                >
                  Cco
                </button>
              )}
            </div>

            {/* Recipient Autocomplete Dropdown */}
            {showToAutofill && filteredRecipients.length > 0 && (
              <div
                ref={toAutofillRef}
                className="absolute left-16 right-4 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-glass-lg overflow-hidden py-1 max-h-48 overflow-y-auto animate-fade-in"
              >
                {filteredRecipients.map((item) => (
                  <div
                    key={item.email}
                    onClick={() => {
                      setTo(item.email)
                      setShowToAutofill(false)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setRecipientContextMenu({ visible: true, x: e.clientX, y: e.clientY, email: item.email })
                    }}
                    className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-input transition-colors group select-none text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-5 h-5 rounded-full bg-sidebar flex items-center justify-center shrink-0 border border-border/60">
                        <UserIcon className="w-3 h-3 text-text-muted" />
                      </div>
                      <div className="truncate">
                        <span className="font-medium text-text">{item.email}</span>
                        {item.name && (
                          <span className="text-[10px] text-text-muted ml-1.5 font-normal">({item.name})</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        const updated = deleteRecipient(item.email)
                        setRecentRecipients(updated)
                      }}
                      title={t('composer.autofill.delete')}
                      className="p-1 rounded text-text-muted hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Optional Cc Field */}
          {showCc && (
            <div className="flex items-center px-4 py-2 border-b border-border/40 gap-2 animate-fade-in">
              <span className="text-text-muted font-medium w-12 shrink-0">{t('composer.cc')}</span>
              <input
                type="text"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder={t('composer.ccPlaceholder')}
                className="flex-1 bg-transparent border-none text-text placeholder:text-text-muted focus:outline-hidden text-xs"
              />
            </div>
          )}

          {/* Optional Bcc Field */}
          {showBcc && (
            <div className="flex items-center px-4 py-2 border-b border-border/40 gap-2 animate-fade-in">
              <span className="text-text-muted font-medium w-12 shrink-0">{t('composer.bcc')}</span>
              <input
                type="text"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder={t('composer.bccPlaceholder')}
                className="flex-1 bg-transparent border-none text-text placeholder:text-text-muted focus:outline-hidden text-xs"
              />
            </div>
          )}

          {/* Subject Field */}
          <div className="flex items-center px-4 py-2 border-b border-border/40 gap-2">
            <span className="text-text-muted font-medium w-12 shrink-0">{t('composer.subject')}</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('composer.subjectPlaceholder')}
              className="flex-1 bg-transparent border-none text-text placeholder:text-text-muted focus:outline-hidden text-xs font-medium"
            />
          </div>

          {/* Error notice */}
          {error && (
            <div className="px-4 py-2 bg-input/40 border-b border-border text-xs text-text">
              {error}
            </div>
          )}

          {/* Gmail-Style Rich ContentEditable Editor */}
          <div className="flex-1 p-4 overflow-y-auto relative flex flex-col">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onClick={handleEditorClick}
              onKeyDown={handleEditorKeyDown}
              onInput={() => {
                if (editorRef.current) {
                  setBody(editorRef.current.innerHTML)
                }
              }}
              onKeyUp={saveSelection}
              onMouseUp={saveSelection}
              onPaste={handlePaste}
              onContextMenu={(e) => {
                e.preventDefault()
                saveSelection()
                setBodyContextMenu({ visible: true, x: e.clientX, y: e.clientY })
              }}
              className="w-full h-full min-h-[160px] bg-transparent text-text focus:outline-hidden text-xs leading-relaxed font-sans cursor-text [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-text-muted [&:empty]:before:pointer-events-none"
              data-placeholder={t('composer.bodyPlaceholder')}
            />
          </div>

          {/* Attachments Section Tray */}
          {attachments.length > 0 && (
            <div className="px-4 py-2.5 border-t border-border/60 bg-sidebar/30 max-h-36 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-text-muted flex items-center gap-1.5">
                  <PaperClipIcon className="w-3.5 h-3.5" />
                  {t('composer.attachments', { count: attachments.length })}
                </span>
                {totalAttachmentsSize > 0 && (
                  <span className="text-[10px] text-text-muted">
                    {t('composer.total', { size: formatFileSize(totalAttachmentsSize) })}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {attachments.map((att) => {
                  const isImage = att.contentType.startsWith('image/') || Boolean(att.previewUrl)
                  const fileInfo = getAttachmentFileInfo(att.filename, att.contentType)

                  return (
                    <div
                      key={att.id}
                      className="group relative flex items-center gap-2.5 p-2 rounded-xl bg-card border border-border/80 shadow-xs hover:border-accent/50 transition-all overflow-hidden"
                    >
                      {/* Image Thumbnail or File Icon */}
                      {isImage && att.previewUrl ? (
                        <div
                          onClick={() => setPreviewImage({ url: att.previewUrl!, name: att.filename })}
                          className="w-9 h-9 rounded-lg overflow-hidden bg-sidebar shrink-0 border border-border/40 cursor-pointer relative group/thumb"
                           title={t('composer.preview.clickToEnlarge')}
                        >
                          <img
                            src={att.previewUrl}
                            alt={att.filename}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-bg/50 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity text-text">
                            <EyeIcon className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-sidebar flex items-center justify-center shrink-0 border border-border/40">
                          <OfficialFileIcon category={fileInfo.category} className="w-4 h-4" />
                        </div>
                      )}

                      {/* File Details */}
                      <div className="flex-1 min-w-0 pr-6">
                        <p className="text-xs font-medium text-text truncate" title={att.filename}>
                          {att.filename}
                        </p>
                        <p className="text-[10px] text-text-muted mt-0.5">
                          {att.size > 0 ? formatFileSize(att.size) : isImage ? t('composer.attachment.imageFallback') : fileInfo.label}
                        </p>
                      </div>

                      {/* Remove Button (top-right corner) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeAttachment(att.id)
                        }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-input/80 hover:bg-accent text-text-muted hover:text-bg flex items-center justify-center transition-all z-10 cursor-pointer shadow-xs border border-border/60 hover:border-transparent"
                        title={t('composer.preview.remove')}
                        aria-label={t('composer.preview.remove')}
                      >
                        <XMarkIcon className="w-3 h-3 stroke-[2.5]" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Bottom Toolbar & Send Button */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-sidebar/40">
            <div className="flex items-center gap-1.5">
              <button
                type="submit"
                disabled={loading || !to.trim()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-semibold text-xs bg-accent text-bg shadow-glass-sm hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all"
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                    <span>{t('composer.sending')}</span>
                  </>
                ) : (
                  <>
                    <PaperAirplaneIcon className="w-3.5 h-3.5 stroke-2" />
                    <span>{t('composer.send')}</span>
                  </>
                )}
              </button>

              <div className="h-4 w-px bg-border/60 mx-0.5" />

              {/* Attach File Button (To Attachment Tray) */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingAttachments}
                className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-input transition-colors"
                title={t('composer.attachFiles')}
              >
                <PaperClipIcon className="w-4 h-4" />
              </button>

              {/* Insert Inline Image Button */}
              <button
                type="button"
                onClick={() => imageInputInlineRef.current?.click()}
                disabled={isProcessingAttachments}
                className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-input transition-colors"
                title={t('composer.insertImage')}
              >
                <PhotoIcon className="w-4 h-4" />
              </button>

              {isProcessingAttachments && (
                <div className="flex items-center gap-1 text-[11px] text-text-muted">
                  <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              <div className="h-4 w-px bg-border/60 mx-0.5" />

              <label className="flex items-center gap-1 text-xs text-text-muted cursor-pointer hover:text-text select-none" title="Enviar e-mail formatado como HTML">
                <input
                  type="checkbox"
                  checked={isHtml}
                  onChange={(e) => setIsHtml(e.target.checked)}
                  className="rounded border-border accent-accent"
                />
                <span>HTML</span>
              </label>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-input text-text-muted hover:text-text transition-colors"
              title={t('composer.discard')}
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* Image Lightbox Preview Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-60 bg-bg/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in cursor-zoom-out"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-2xl shadow-glass-lg max-w-2xl max-h-[80vh] overflow-hidden flex flex-col cursor-default animate-scale-up"
          >
            <div className="flex items-center justify-between px-4 py-2.5 bg-sidebar border-b border-border select-none">
              <span className="text-xs font-semibold text-text truncate">{previewImage.name}</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1 rounded-lg hover:bg-input text-text-muted hover:text-text transition-colors"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center overflow-auto bg-sidebar/20">
              <img
                src={previewImage.url}
                alt={previewImage.name}
                className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Body Editor Context Menu (Right Click) */}
      {bodyContextMenu && bodyContextMenu.visible && (
        <ContextMenu
          x={bodyContextMenu.x}
          y={bodyContextMenu.y}
          onClose={() => setBodyContextMenu(null)}
          items={[
            {
              id: 'paste',
              label: t('composer.menu.paste'),
              shortcut: 'Ctrl+V',
              onClick: handleContextMenuPaste
            },
            {
              id: 'copy',
              label: t('composer.menu.copy'),
              shortcut: 'Ctrl+C',
              onClick: () => {
                if (editorRef.current) editorRef.current.focus()
                document.execCommand('copy')
              }
            },
            {
              id: 'cut',
              label: t('composer.menu.cut'),
              shortcut: 'Ctrl+X',
              onClick: () => {
                if (editorRef.current) editorRef.current.focus()
                document.execCommand('cut')
                if (editorRef.current) setBody(editorRef.current.innerHTML)
              }
            },
            {
              id: 'insert-inline-img',
              label: t('composer.menu.insertImage'),
              onClick: () => {
                imageInputInlineRef.current?.click()
              }
            },
            {
              id: 'attach-file',
              label: t('composer.menu.attachFile'),
              onClick: () => {
                fileInputRef.current?.click()
              }
            },
            {
              id: 'select-all',
              label: t('composer.menu.selectAll'),
              shortcut: 'Ctrl+A',
              onClick: () => {
                if (editorRef.current) {
                  editorRef.current.focus()
                  document.execCommand('selectAll')
                }
              }
            },
            {
              id: 'clear-formatting',
              label: t('composer.menu.clearFormatting'),
              onClick: () => {
                if (editorRef.current) {
                  editorRef.current.focus()
                  document.execCommand('removeFormat')
                  setBody(editorRef.current.innerHTML)
                }
              }
            }
          ]}
          minWidth={220}
        />
      )}

      {/* Recipient Context Menu */}
      {recipientContextMenu && recipientContextMenu.visible && (
        <ContextMenu
          x={recipientContextMenu.x}
          y={recipientContextMenu.y}
          onClose={() => setRecipientContextMenu(null)}
          items={[
            {
              id: 'delete-recipient',
              label: t('composer.autofill.delete'),
              shortcut: 'Del',
              danger: true,
              onClick: () => {
                const updated = deleteRecipient(recipientContextMenu.email)
                setRecentRecipients(updated)
              }
            }
          ]}
          minWidth={200}
        />
      )}
    </div>
    </>
  )
}

export default EmailComposer
