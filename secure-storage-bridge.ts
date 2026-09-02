// secure-storage-bridge.ts
// Bridge between the momai-emails worker and the Electron OS keychain (safeStorage),
// with an AES-256-GCM fallback when running outside Electron or if safeStorage is unavailable.

const crypto = require('node:crypto')

const SECURE_STORAGE_TIMEOUT_MS = 5000
const pending = new Map<string, { resolve: (val: any) => void; timeout: any }>()
let nextId = 1

if (typeof process !== 'undefined' && typeof process.on === 'function') {
  process.on('message', (msg: any) => {
    if (!msg || typeof msg !== 'object') return
    if (
      msg.type === 'secure-storage:encrypt-result' ||
      msg.type === 'secure-storage:decrypt-result'
    ) {
      const handler = pending.get(msg.requestId)
      if (handler) {
        pending.delete(msg.requestId)
        clearTimeout(handler.timeout)
        handler.resolve(msg.ack || null)
      }
    }
  })
}

function _request(requestType: string, payload: any): Promise<any> {
  return new Promise((resolve) => {
    if (typeof process === 'undefined' || typeof process.send !== 'function') {
      resolve(null)
      return
    }
    const requestId = `sstorage-${nextId++}-${Date.now()}`
    const timeout = setTimeout(() => {
      pending.delete(requestId)
      resolve(null)
    }, SECURE_STORAGE_TIMEOUT_MS)
    pending.set(requestId, { resolve, timeout })
    try {
      process.send({ type: requestType, requestId, payload })
    } catch {
      pending.delete(requestId)
      clearTimeout(timeout)
      resolve(null)
    }
  })
}

// AES-256-GCM fallback encryption key derived from machine identifier or local constant
function getFallbackKey(): Buffer {
  const seed = process.env.COMPUTERNAME || process.env.HOSTNAME || process.env.USERNAME || 'momai-default-key-seed'
  return crypto.createHash('sha256').update(`momai-emails-salt-${seed}`).digest()
}

function encryptFallback(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getFallbackKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `aes:${Buffer.concat([iv, tag, encrypted]).toString('base64')}`
}

function decryptFallback(cipherText: string): string | null {
  try {
    if (!cipherText.startsWith('aes:')) return null
    const buf = Buffer.from(cipherText.slice(4), 'base64')
    if (buf.length < 28) return null
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const data = buf.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', getFallbackKey(), iv)
    decipher.setAuthTag(tag)
    return decipher.update(data, undefined, 'utf8') + decipher.final('utf8')
  } catch {
    return null
  }
}

/**
 * Encrypt a plaintext string. Uses OS safeStorage via host bridge first, with AES-256-GCM fallback.
 */
async function encryptForStorage(plain: string): Promise<string> {
  if (!plain) return ''
  const ack = await _request('secure-storage:encrypt', { plain })
  if (ack && ack.ok && ack.encrypted) {
    return `ss:${ack.encrypted}`
  }
  return encryptFallback(plain)
}

/**
 * Decrypt a ciphertext string. Handles both safeStorage and AES-256-GCM formats.
 */
async function decryptFromStorage(cipherText: string): Promise<string | null> {
  if (!cipherText) return ''
  if (cipherText.startsWith('ss:')) {
    const rawCipher = cipherText.slice(3)
    const ack = await _request('secure-storage:decrypt', { encryptedBase64: rawCipher })
    if (ack && ack.ok && ack.plain != null) {
      return ack.plain
    }
  }
  if (cipherText.startsWith('aes:')) {
    return decryptFallback(cipherText)
  }
  // Try decrypting as safeStorage fallback without prefix
  const ack = await _request('secure-storage:decrypt', { encryptedBase64: cipherText })
  if (ack && ack.ok && ack.plain != null) {
    return ack.plain
  }
  return decryptFallback(`aes:${cipherText}`) || cipherText
}

module.exports = { encryptForStorage, decryptFromStorage }
