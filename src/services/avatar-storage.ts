// src/services/avatar-storage.ts
// Persistent custom profile photos behind the header avatar.
// Photos are downscaled to a small JPEG thumbnail before storage so a phone
// picture never exceeds the renderer quota and silently disappears on reload.

export interface AvatarStore {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export const AVATAR_SIZE_PX = 128
export const MAX_AVATAR_BYTES = 80_000

export function avatarKey(accountId: string): string {
  return `momai_emails_avatar_${accountId}`
}

export function isSupportedAvatarDataUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(value)
}

export function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  return Math.floor(payload.length * 0.75)
}

export function isOversizedAvatar(dataUrl: string): boolean {
  return estimateDataUrlBytes(dataUrl) > MAX_AVATAR_BYTES
}

function memoryStore(): AvatarStore {
  const data = new Map<string, string>()
  return {
    getItem: (key) => (data.has(key) ? data.get(key) ?? null : null),
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}

let sharedMemory: AvatarStore | null = null

export function defaultAvatarStore(): AvatarStore {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // Fall through to memory when storage is unavailable.
  }
  if (!sharedMemory) sharedMemory = memoryStore()
  return sharedMemory
}

export function loadAvatar(store: AvatarStore, accountId: string): string | null {
  if (!accountId) return null
  try {
    const saved = store.getItem(avatarKey(accountId))
    if (!saved || !isSupportedAvatarDataUrl(saved)) return null
    return saved
  } catch {
    return null
  }
}

export function saveAvatar(store: AvatarStore, accountId: string, dataUrl: string): boolean {
  if (!accountId || !isSupportedAvatarDataUrl(dataUrl)) return false
  if (isOversizedAvatar(dataUrl)) return false
  try {
    store.setItem(avatarKey(accountId), dataUrl)
    return true
  } catch {
    return false
  }
}

export function removeAvatar(store: AvatarStore, accountId: string): void {
  if (!accountId) return
  try {
    store.removeItem(avatarKey(accountId))
  } catch {
    // Removal is best effort; a missing photo falls back to the initial.
  }
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file'))
      reader.readAsDataURL(file)
    } catch (err) {
      reject(err)
    }
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to decode image file'))
    image.src = dataUrl
  })
}

/**
 * Downscale an uploaded photo to a small JPEG thumbnail that always fits
 * in renderer storage. Falls back to the original data URL when canvas is
 * unavailable so callers can still attempt a bounded save.
 */
export async function downscaleImageFileToAvatar(file: Blob): Promise<string> {
  const original = await readFileAsDataUrl(file)
  try {
    if (typeof document === 'undefined') return original
    const image = await loadImage(original)
    const scale = Math.min(1, AVATAR_SIZE_PX / Math.max(image.naturalWidth || 1, image.naturalHeight || 1))
    const width = Math.max(1, Math.round((image.naturalWidth || AVATAR_SIZE_PX) * scale))
    const height = Math.max(1, Math.round((image.naturalHeight || AVATAR_SIZE_PX) * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return original
    context.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', 0.82)
  } catch {
    return original
  }
}
