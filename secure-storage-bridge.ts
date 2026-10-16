// secure-storage-bridge.ts
// Bridge between the momai-emails worker and the Electron OS keychain (safeStorage).
//
// Security model (aligned with the WhatsApp extension): credentials are only
// persisted through the host keychain. There is no machine-derived "fallback"
// encryption anymore — a weak key derived from COMPUTERNAME/USERNAME offered
// no real protection and gave a false sense of safety.
// When the keychain is unavailable, saveAccounts keeps the accounts in memory
// for the current session and warns instead of writing reversible ciphertext.
//
// The `aes:` reader is kept only to migrate data written by older versions:
// once the keychain works again, the next save re-encrypts to `ss:`.

const crypto = require('node:crypto')

const SECURE_STORAGE_TIMEOUT_MS = 15000
const LEGACY_PREFIX = 'aes:'
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
    if (typeof process === 'undefined' || typeof process.send !== 'function' || process.env.VITEST) {
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

// ---------------------------------------------------------------------------
// Legacy reader only. Never used to write new data.
// ---------------------------------------------------------------------------

function getLegacyKey(): Buffer {
  const seed = process.env.COMPUTERNAME || process.env.HOSTNAME || process.env.USERNAME || 'momai-default-key-seed'
  return crypto.createHash('sha256').update(`momai-emails-salt-${seed}`).digest()
}

function decryptLegacy(cipherText: string): string | null {
  try {
    if (!cipherText.startsWith(LEGACY_PREFIX)) return null
    const buf = Buffer.from(cipherText.slice(LEGACY_PREFIX.length), 'base64')
    if (buf.length < 28) return null
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const data = buf.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', getLegacyKey(), iv)
    decipher.setAuthTag(tag)
    return decipher.update(data, undefined, 'utf8') + decipher.final('utf8')
  } catch {
    return null
  }
}

/**
 * Encrypt a plaintext string through the OS keychain. Returns null when the
 * keychain is unavailable; callers must not persist plaintext themselves.
 */
async function encryptForStorage(plain: string): Promise<string | null> {
  if (!plain) return ''
  const ack = await _request('secure-storage:encrypt', { plain })
  if (ack && ack.ok && ack.encrypted) {
    return `ss:${ack.encrypted}`
  }
  return null
}

/**
 * Decrypt a stored value. Accepts the current `ss:` format and the legacy
 * `aes:` format (migration only). Returns null when nothing could be
 * decrypted; never echoes the ciphertext back as if it were plaintext.
 */
async function decryptFromStorage(cipherText: string): Promise<string | null> {
  if (!cipherText) return ''
  if (cipherText.startsWith('ss:')) {
    const rawCipher = cipherText.slice(3)
    const ack = await _request('secure-storage:decrypt', { encryptedBase64: rawCipher })
    if (ack && ack.ok && ack.plain != null) {
      return ack.plain
    }
    return null
  }
  if (cipherText.startsWith(LEGACY_PREFIX)) {
    return decryptLegacy(cipherText)
  }
  // Very old entries had no prefix. Try the keychain, then the legacy reader.
  const ack = await _request('secure-storage:decrypt', { encryptedBase64: cipherText })
  if (ack && ack.ok && ack.plain != null) {
    return ack.plain
  }
  return decryptLegacy(`${LEGACY_PREFIX}${cipherText}`)
}

module.exports = { encryptForStorage, decryptFromStorage }
