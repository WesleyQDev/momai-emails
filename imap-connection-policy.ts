// imap-connection-policy.ts
// Shared policy for polite IMAP retries: quota backoff stays per account,
// offline errors never count as quota, and repeated warnings collapse to one log.
// Pure CommonJS + erasable TypeScript

'use strict'

const QUOTA_BASE_DELAY_MS = 30_000
const QUOTA_MAX_DELAY_MS = 600_000
const QUOTA_LOG_COOLDOWN_MS = 600_000
const NETWORK_LOG_COOLDOWN_MS = 300_000
const BACKOFF_JITTER_MS = 5_000

const NETWORK_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENETDOWN',
  'EPIPE'
])

function getErrorText(err: unknown): string {
  if (!err) return ''
  if (typeof err === 'string') return err
  const parts: string[] = []
  const anyErr = err as { message?: unknown; responseText?: unknown; code?: unknown; response?: unknown }
  if (typeof anyErr.responseText === 'string') parts.push(anyErr.responseText)
  if (typeof anyErr.message === 'string') parts.push(anyErr.message)
  if (typeof anyErr.code === 'string' || typeof anyErr.code === 'number') parts.push(String(anyErr.code))
  if (typeof anyErr.response === 'string') parts.push(anyErr.response)
  if (parts.length === 0) {
    try {
      return String(err)
    } catch {
      return ''
    }
  }
  return parts.join(' ')
}

function getErrorCode(err: unknown): string {
  if (!err || typeof err !== 'object') return ''
  const code = (err as { code?: unknown }).code
  return typeof code === 'string' ? code.toUpperCase() : ''
}

// Quota errors come from the server (Gmail caps simultaneous IMAP sessions),
// so they must win over generic network matching like "Command failed".
function isQuotaText(text: string): boolean {
  return /too many simultaneous connections|too many connections|maximum connections|connection limit|exceeded.*connection|limit.*connection/i.test(text)
}

function isNetworkText(text: string): boolean {
  return /enotfound|eai_again|econnrefused|econnreset|etimedout|enetunreach|ehostunreach|enetdown|network is unreachable|socket (hang up|closed|timed out)|dns lookup|getaddrinfo|connection (refused|reset|timed out)|timed out|offline/i.test(text)
}

function isAuthText(text: string): boolean {
  return /authentication failed|auth failed|invalid credentials|login failed|\[AUTH/i.test(text)
}

function classifyImapError(err: unknown): string {
  const text = getErrorText(err)
  if (isQuotaText(text)) return 'quota'
  const code = getErrorCode(err)
  if (code && NETWORK_CODES.has(code)) return 'network'
  if (isNetworkText(text)) return 'network'
  if (isAuthText(text)) return 'auth'
  return 'other'
}

// Exponential per-account delay with small jitter so accounts stopped
// together do not wake up together and re-hit the server limit at once.
function computeQuotaCooldownMs(failureCount: number): number {
  const step = Math.max(1, Math.floor(failureCount || 1))
  const grown = QUOTA_BASE_DELAY_MS * Math.pow(2, step - 1)
  const capped = Math.min(grown, QUOTA_MAX_DELAY_MS)
  const jitter = Math.floor(Math.random() * BACKOFF_JITTER_MS)
  return capped + jitter
}

function shouldEmitLog(lastLoggedAt: number | undefined, now: number, cooldownMs: number): boolean {
  if (!lastLoggedAt) return true
  return now - lastLoggedAt >= cooldownMs
}

module.exports = {
  QUOTA_BASE_DELAY_MS,
  QUOTA_MAX_DELAY_MS,
  QUOTA_LOG_COOLDOWN_MS,
  NETWORK_LOG_COOLDOWN_MS,
  BACKOFF_JITTER_MS,
  classifyImapError,
  computeQuotaCooldownMs,
  shouldEmitLog
}
