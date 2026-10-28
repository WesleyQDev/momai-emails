// account-manager.ts
// Manages multi-account persistence, encryption, active account state, and new email monitoring
// Pure CommonJS + erasable TypeScript

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { encryptForStorage, decryptFromStorage } = require('./secure-storage-bridge.ts')
const { PROVIDERS, detectProviderFromEmail } = require('./providers-data.ts')
const emailClient = require('./email-client.ts')
const connectionPolicy = require('./imap-connection-policy.ts')

const MAX_REMOTE_AVATAR_BYTES = 75_000
const AVATAR_FETCH_TIMEOUT_MS = 6_000

async function downloadAvatarDataUrl(
  url: string,
  fetchFn: typeof fetch
): Promise<string | null> {
  try {
    const res = await fetchFn(url, {
      headers: { 'User-Agent': 'MomAI-Emails/1.0' },
      signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS)
        : undefined
    } as any)
    if (!res || !res.ok) return null
    const rawType = String(res.headers?.get?.('content-type') || '').toLowerCase()
    const match = rawType.match(/^image\/(png|jpeg|jpg|webp|gif)/)
    if (!match) return null
    const subtype = match[1] === 'jpg' ? 'jpeg' : match[1]
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0 || buf.length > MAX_REMOTE_AVATAR_BYTES) return null
    return `data:image/${subtype};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

function appendAvatarSize(url: string, size: number): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}s=${size}`
}

/**
 * Resolves the user's original public profile photo associated with an e-mail
 * address (Gravatar, Libravatar, or verified GitHub account/commit author for
 * that exact address) and returns a bounded base64 data URL ready for storage.
 */
async function fetchAccountAvatar(
  email: string,
  fetchImpl?: typeof fetch
): Promise<string | null> {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized || !normalized.includes('@')) return null
  const fetchFn: typeof fetch | undefined =
    fetchImpl || (typeof fetch === 'function' ? fetch : undefined)
  if (!fetchFn) return null

  const md5 = crypto.createHash('md5').update(normalized).digest('hex')

  // 1. Gravatar (d=404 ensures we only accept a real user-uploaded photo)
  for (const size of [128, 80]) {
    const gravatar = await downloadAvatarDataUrl(
      `https://www.gravatar.com/avatar/${md5}?d=404&s=${size}`,
      fetchFn
    )
    if (gravatar) return gravatar
  }

  // 2. Libravatar
  for (const size of [128, 80]) {
    const libravatar = await downloadAvatarDataUrl(
      `https://seccdn.libravatar.org/avatar/${md5}?d=404&s=${size}`,
      fetchFn
    )
    if (libravatar) return libravatar
  }

  // 3. GitHub public user lookup by exact email
  try {
    const userRes = await fetchFn(
      `https://api.github.com/search/users?q=${encodeURIComponent(normalized)}+in:email&per_page=1`,
      {
        headers: {
          'User-Agent': 'MomAI-Emails/1.0',
          Accept: 'application/vnd.github+json'
        },
        signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS)
          : undefined
      } as any
    )
    if (userRes && userRes.ok) {
      const data: any = await userRes.json()
      const first = Array.isArray(data?.items) ? data.items[0] : null
      if (first && first.type !== 'Bot' && typeof first.avatar_url === 'string' && first.avatar_url) {
        for (const size of [128, 80]) {
          const img = await downloadAvatarDataUrl(appendAvatarSize(first.avatar_url, size), fetchFn)
          if (img) return img
        }
      }
    }
  } catch {}

  // 4. GitHub commit author lookup by exact author email
  try {
    const commitRes = await fetchFn(
      `https://api.github.com/search/commits?q=author-email:${encodeURIComponent(normalized)}&per_page=1`,
      {
        headers: {
          'User-Agent': 'MomAI-Emails/1.0',
          Accept: 'application/vnd.github.cloak-preview+json'
        },
        signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS)
          : undefined
      } as any
    )
    if (commitRes && commitRes.ok) {
      const data: any = await commitRes.json()
      const first = Array.isArray(data?.items) ? data.items[0] : null
      const authorEmail = String(first?.commit?.author?.email || '').trim().toLowerCase()
      const committerEmail = String(first?.commit?.committer?.email || '').trim().toLowerCase()
      const avatarUrl = first?.author?.avatar_url
      if (
        first?.author?.type !== 'Bot' &&
        typeof avatarUrl === 'string' &&
        avatarUrl &&
        (authorEmail === normalized || committerEmail === normalized)
      ) {
        for (const size of [128, 80]) {
          const img = await downloadAvatarDataUrl(appendAvatarSize(avatarUrl, size), fetchFn)
          if (img) return img
        }
      }
    }
  } catch {}

  return null
}

class AccountManager {
  private storageDir: string
  private accountsFile: string
  private notifyPrefsFile: string
  private rememberedPasswordsFile: string
  private injectedStorage: {
    get?: (key: string) => Promise<any>
    set?: (key: string, value: any) => Promise<void>
    delete?: (key: string) => Promise<void>
  } | null = null
  private avatarFetcher: ((email: string) => Promise<string | null>) | null = null
  private accounts: Map<string, any> = new Map()
  private avatars: Map<string, string> = new Map()
  // Passwords the user opted to remember on the connection screen, keyed by
  // normalized e-mail. Kept apart from `accounts` so they survive a disconnect.
  private rememberedPasswords: Map<string, string> = new Map()
  private autoAvatarAttempted: Set<string> = new Set()
  private removedAvatars: Set<string> = new Set()
  private activeAccountId: string | null = null
  private pollInterval: any = null
  private lastSeenUids: Map<string, number> = new Map()
  private seenUids: Map<string, Set<number>> = new Map()
  private unreadCounts: Map<string, number> = new Map()
  private isChecking = false
  private quotaCooldownUntil: Map<string, number> = new Map()
  private quotaFailures: Map<string, number> = new Map()
  private lastQuotaLogAt: Map<string, number> = new Map()
  private suppressedQuotaWarnings: Map<string, number> = new Map()
  private lastNetworkLogAt: Map<string, number> = new Map()
  private suppressedNetworkWarnings: Map<string, number> = new Map()
  private onNewEmailCallback?: (event: { accountId: string; email: any; totalUnread: number }) => void

  constructor(storageDir?: string, deps?: {
    storage?: {
      get?: (key: string) => Promise<any>
      set?: (key: string, value: any) => Promise<void>
      delete?: (key: string) => Promise<void>
    }
    avatarFetcher?: ((email: string) => Promise<string | null>) | null
  }) {
    const defaultDataDir = process.env.MOMAI_NODE_CORE_DATA_DIR || process.env.MOMAI_DATA_DIR || path.join(process.cwd(), 'data')
    // MOMAI_EXTENSION_STORAGE_DIR is mode-scoped (Symlink vs Testar Loja), so
    // accounts and preferences never leak across environments.
    this.storageDir =
      storageDir ||
      process.env.MOMAI_EXTENSION_STORAGE_DIR ||
      path.join(defaultDataDir, 'extensions', 'momai-emails')
    this.accountsFile = path.join(this.storageDir, 'accounts.json.enc')
    this.notifyPrefsFile = path.join(this.storageDir, 'notify-prefs.json')
    this.rememberedPasswordsFile = path.join(this.storageDir, 'remembered-passwords.json.enc')
    if (deps && deps.storage) this.injectedStorage = deps.storage
    if (deps && 'avatarFetcher' in deps) {
      this.avatarFetcher = deps.avatarFetcher ?? null
    } else if (!process.env.VITEST) {
      this.avatarFetcher = (email: string) => fetchAccountAvatar(email)
    }
    fs.mkdirSync(this.storageDir, { recursive: true })
  }

  private useHostStorage(): boolean {
    return !!(
      this.injectedStorage &&
      typeof this.injectedStorage.get === 'function' &&
      typeof this.injectedStorage.set === 'function'
    )
  }

  private async readStoredText(key: string, legacyFile: string): Promise<string | null> {
    if (this.useHostStorage()) {
      try {
        const stored = await this.injectedStorage!.get!(key)
        if (typeof stored === 'string' && stored.length > 0) return stored
        if (stored !== null && stored !== undefined && typeof stored !== 'string') {
          return JSON.stringify(stored)
        }
      } catch {}
      try {
        if (fs.existsSync(legacyFile)) {
          const raw = fs.readFileSync(legacyFile, 'utf8')
          if (raw && raw.trim()) {
            try {
              await this.injectedStorage!.set!(key, raw)
            } catch {}
            return raw
          }
        }
      } catch {}
      return null
    }
    return null
  }

  private async writeStoredText(key: string, value: string, legacyFile: string): Promise<void> {
    if (this.useHostStorage()) {
      await this.injectedStorage!.set!(key, value)
      return
    }
    fs.writeFileSync(legacyFile, value, 'utf8')
  }

  private async readStoredJson(key: string, legacyFile: string): Promise<any | null> {
    if (this.useHostStorage()) {
      try {
        const stored = await this.injectedStorage!.get!(key)
        if (stored !== null && stored !== undefined) return stored
      } catch {}
      try {
        if (fs.existsSync(legacyFile)) {
          const parsed = JSON.parse(fs.readFileSync(legacyFile, 'utf8'))
          try {
            await this.injectedStorage!.set!(key, parsed)
          } catch {}
          return parsed
        }
      } catch {}
      return null
    }
    return null
  }

  private async writeStoredJson(key: string, value: any, legacyFile: string): Promise<void> {
    if (this.useHostStorage()) {
      await this.injectedStorage!.set!(key, value)
      return
    }
    fs.writeFileSync(legacyFile, JSON.stringify(value), 'utf8')
  }

  public setOnNewEmail(callback: (event: { accountId: string; email: any; totalUnread: number }) => void) {
    this.onNewEmailCallback = callback
  }

  public getTotalUnreadCount(): number {
    let total = 0
    for (const count of this.unreadCounts.values()) {
      total += count
    }
    return total
  }

  public async getNotificationPrefs(): Promise<{ primaryOnly: boolean; notificationsEnabled: boolean; unreadWindowHours: 24 | 48 }> {
    if (this.useHostStorage()) {
      try {
        const stored = await this.readStoredJson('notify-prefs', this.notifyPrefsFile)
        if (stored && typeof stored === 'object') {
          return {
            primaryOnly: typeof stored.primaryOnly === 'boolean' ? stored.primaryOnly : true,
            notificationsEnabled:
              typeof stored.notificationsEnabled === 'boolean' ? stored.notificationsEnabled : true,
            unreadWindowHours: stored.unreadWindowHours === 24 ? 24 : 48
          }
        }
      } catch {}
      return { primaryOnly: true, notificationsEnabled: true, unreadWindowHours: 48 }
    }
    try {
      if (fs.existsSync(this.notifyPrefsFile)) {
        const parsed = JSON.parse(fs.readFileSync(this.notifyPrefsFile, 'utf8')) || {}
        return {
          primaryOnly: typeof parsed.primaryOnly === 'boolean' ? parsed.primaryOnly : true,
          notificationsEnabled:
            typeof parsed.notificationsEnabled === 'boolean' ? parsed.notificationsEnabled : true,
          unreadWindowHours: parsed.unreadWindowHours === 24 ? 24 : 48
        }
      }
    } catch {}
    return { primaryOnly: true, notificationsEnabled: true, unreadWindowHours: 48 }
  }

  public async setNotificationPrefs(prefs: { primaryOnly?: boolean; notificationsEnabled?: boolean; unreadWindowHours?: number }): Promise<{
    primaryOnly: boolean
    notificationsEnabled: boolean
    unreadWindowHours: 24 | 48
  }> {
    const current = await this.getNotificationPrefs()
    const next = {
      primaryOnly: typeof prefs.primaryOnly === 'boolean' ? prefs.primaryOnly : current.primaryOnly,
      notificationsEnabled:
        typeof prefs.notificationsEnabled === 'boolean' ? prefs.notificationsEnabled : current.notificationsEnabled,
      unreadWindowHours: (prefs.unreadWindowHours === 24 ? 24 : prefs.unreadWindowHours === 48 ? 48 : current.unreadWindowHours) as 24 | 48
    }
    try {
      await this.writeStoredJson('notify-prefs', next, this.notifyPrefsFile)
    } catch {}
    return next
  }

  private avatarStorageKey(accountId: string): string {
    return `avatar_${accountId}`
  }

  private isSupportedAvatar(value: unknown): value is string {
    if (typeof value !== 'string') return false
    if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(value)) return false
    // Keep thumbnails well under the 1 MB host storage limit per key.
    if (value.length > 400_000) return false
    return true
  }

  private async readStoredAvatar(accountId: string): Promise<string | null> {
    if (!accountId) return null
    if (this.avatars.has(accountId)) {
      return this.avatars.get(accountId)!
    }
    try {
      if (this.useHostStorage()) {
        const stored = await this.injectedStorage!.get!(this.avatarStorageKey(accountId))
        if (this.isSupportedAvatar(stored)) {
          this.avatars.set(accountId, stored as string)
          return stored as string
        }
      }
      const legacyFile = path.join(this.storageDir, `avatar_${accountId}.txt`)
      if (fs.existsSync(legacyFile)) {
        const raw = fs.readFileSync(legacyFile, 'utf8')
        if (this.isSupportedAvatar(raw)) {
          this.avatars.set(accountId, raw)
          if (this.useHostStorage()) {
            try {
              await this.injectedStorage!.set!(this.avatarStorageKey(accountId), raw)
            } catch {}
          }
          return raw
        }
      }
    } catch {}
    return null
  }

  public async getAvatar(accountId: string, emailHint?: string): Promise<string | null> {
    if (!accountId) return null
    const existing = await this.readStoredAvatar(accountId)
    if (existing) return existing

    if (
      this.avatarFetcher &&
      !this.removedAvatars.has(accountId) &&
      !this.autoAvatarAttempted.has(accountId)
    ) {
      if (this.accounts.size === 0 && !emailHint) {
        try {
          await this.loadAccounts()
        } catch {}
      }
      const email = String(emailHint || this.accounts.get(accountId)?.email || '').trim()
      if (email) {
        this.autoAvatarAttempted.add(accountId)
        try {
          const resolved = await this.avatarFetcher(email)
          if (resolved && this.isSupportedAvatar(resolved)) {
            await this.setAvatar(accountId, resolved)
            return resolved
          }
        } catch {}
      }
    }
    return null
  }

  public async setAvatar(accountId: string, dataUrl: string): Promise<boolean> {
    if (!accountId || !this.isSupportedAvatar(dataUrl)) return false
    try {
      this.avatars.set(accountId, dataUrl)
      this.removedAvatars.delete(accountId)
      if (this.useHostStorage()) {
        await this.injectedStorage!.set!(this.avatarStorageKey(accountId), dataUrl)
        return true
      }
      fs.writeFileSync(path.join(this.storageDir, `avatar_${accountId}.txt`), dataUrl, 'utf8')
      return true
    } catch {
      return false
    }
  }

  public async removeAvatar(accountId: string): Promise<void> {
    if (!accountId) return
    this.avatars.delete(accountId)
    this.removedAvatars.add(accountId)
    try {
      if (this.useHostStorage()) {
        if (typeof this.injectedStorage!.delete === 'function') {
          await this.injectedStorage!.delete!(this.avatarStorageKey(accountId))
        } else {
          await this.injectedStorage!.set!(this.avatarStorageKey(accountId), null as any)
        }
        return
      }
      const legacyFile = path.join(this.storageDir, `avatar_${accountId}.txt`)
      if (fs.existsSync(legacyFile)) fs.rmSync(legacyFile, { force: true })
    } catch {}
  }

  private resolveRememberedPasswordKey(idOrEmail?: string): string | null {
    const value = String(idOrEmail || '').trim()
    if (!value) return null
    const account = this.accounts.get(value)
    if (account?.email) return String(account.email).trim().toLowerCase()
    if (value.includes('@')) return value.toLowerCase()
    return null
  }

  /**
   * Password saved for the connection form autofill. Stored encrypted through
   * the host keychain, never in plain text and never in localStorage.
   */
  public getRememberedPassword(idOrEmail?: string): string | null {
    const key = this.resolveRememberedPasswordKey(idOrEmail)
    if (!key) return null
    return this.rememberedPasswords.get(key) || null
  }

  public async rememberPassword(idOrEmail: string, password: string): Promise<boolean> {
    const key = this.resolveRememberedPasswordKey(idOrEmail)
    if (!key || typeof password !== 'string' || !password) return false
    this.rememberedPasswords.set(key, password)
    return this.saveRememberedPasswords()
  }

  public async forgetRememberedPassword(idOrEmail: string): Promise<boolean> {
    const key = this.resolveRememberedPasswordKey(idOrEmail)
    if (!key) return true
    const existed = this.rememberedPasswords.delete(key)
    if (!existed) return true
    return this.saveRememberedPasswords()
  }

  private async saveRememberedPasswords(): Promise<boolean> {
    try {
      const plain = JSON.stringify(Object.fromEntries(this.rememberedPasswords))
      const encrypted = await encryptForStorage(plain)
      if (!encrypted) {
        console.warn(
          '[AccountManager] Secure storage unavailable; remembered passwords are kept for this session only'
        )
        return false
      }
      await this.writeStoredText('remembered-passwords', encrypted, this.rememberedPasswordsFile)
      return true
    } catch (err) {
      console.error('[AccountManager] Failed to save remembered passwords:', err)
      return false
    }
  }

  public async loadRememberedPasswords(maxRetries: number = 2): Promise<void> {
    try {
      const rawEnc = await this.readStoredText('remembered-passwords', this.rememberedPasswordsFile)
      if (!rawEnc || !rawEnc.trim()) return
      let decrypted = await decryptFromStorage(rawEnc)
      if (!decrypted && maxRetries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        decrypted = await decryptFromStorage(rawEnc)
      }
      if (!decrypted) {
        console.warn('[AccountManager] Could not decrypt remembered passwords (secure storage unavailable?)')
        return
      }
      const parsed = JSON.parse(decrypted)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
      this.rememberedPasswords.clear()
      for (const [email, password] of Object.entries(parsed)) {
        if (typeof password === 'string' && password) {
          this.rememberedPasswords.set(String(email).trim().toLowerCase(), password)
        }
      }
    } catch (err) {
      console.error('[AccountManager] Failed to load remembered passwords:', err)
    }
  }

  public async initialize(): Promise<void> {
    await this.loadAccounts()
    await this.loadRememberedPasswords()
    await this.primeInitialUids()
    this.startBackgroundPoller()
    // Disk cleanup runs after startup so a large cache never delays the worker.
    const pruneTimer = setTimeout(() => {
      try {
        const removed = emailClient.pruneMessageCache()
        if (removed > 0) {
          console.log(`[AccountManager] Pruned ${removed} expired message cache dir(s)`)
        }
      } catch (err: any) {
        console.warn('[AccountManager] Cache prune failed:', err?.message || err)
      }
    }, 5000)
    if (typeof pruneTimer.unref === 'function') pruneTimer.unref()
  }

  private isQuotaCoolingDown(accountId: string, now: number = Date.now()): boolean {
    const until = this.quotaCooldownUntil.get(accountId)
    if (!until) return false
    if (now >= until) {
      this.quotaCooldownUntil.delete(accountId)
      return false
    }
    return true
  }

  private noteQuotaSuccess(accountId: string): void {
    this.quotaFailures.delete(accountId)
    this.quotaCooldownUntil.delete(accountId)
    this.suppressedQuotaWarnings.delete(accountId)
  }

  private noteQuotaHit(accountId: string, email: string, now: number = Date.now()): void {
    const failures = (this.quotaFailures.get(accountId) || 0) + 1
    this.quotaFailures.set(accountId, failures)
    this.quotaCooldownUntil.set(accountId, now + connectionPolicy.computeQuotaCooldownMs(failures))
    const lastLogged = this.lastQuotaLogAt.get(accountId)
    if (connectionPolicy.shouldEmitLog(lastLogged, now, connectionPolicy.QUOTA_LOG_COOLDOWN_MS)) {
      const suppressed = this.suppressedQuotaWarnings.get(accountId) || 0
      const suffix = suppressed > 0 ? ` (${suppressed} similar warnings suppressed)` : ''
      console.log(`[AccountManager] IMAP connection limit reached for ${email}, backing off${suffix}`)
      this.lastQuotaLogAt.set(accountId, now)
      this.suppressedQuotaWarnings.delete(accountId)
    } else {
      this.suppressedQuotaWarnings.set(accountId, (this.suppressedQuotaWarnings.get(accountId) || 0) + 1)
    }
  }

  private noteNetworkBlip(accountId: string, email: string, detail: string, now: number = Date.now()): void {
    const lastLogged = this.lastNetworkLogAt.get(accountId)
    if (connectionPolicy.shouldEmitLog(lastLogged, now, connectionPolicy.NETWORK_LOG_COOLDOWN_MS)) {
      const suppressed = this.suppressedNetworkWarnings.get(accountId) || 0
      const suffix = suppressed > 0 ? ` (${suppressed} similar warnings suppressed)` : ''
      console.log(`[AccountManager] Network unreachable while checking ${email}: ${detail}${suffix}`)
      this.lastNetworkLogAt.set(accountId, now)
      this.suppressedNetworkWarnings.delete(accountId)
    } else {
      this.suppressedNetworkWarnings.set(accountId, (this.suppressedNetworkWarnings.get(accountId) || 0) + 1)
    }
  }

  private clearConnectionState(accountId: string): void {
    this.quotaCooldownUntil.delete(accountId)
    this.quotaFailures.delete(accountId)
    this.lastQuotaLogAt.delete(accountId)
    this.suppressedQuotaWarnings.delete(accountId)
    this.lastNetworkLogAt.delete(accountId)
    this.suppressedNetworkWarnings.delete(accountId)
  }

  public async primeAccount(accId: string, acc: any): Promise<void> {
    try {
      if (!this.seenUids.has(accId)) {
        this.seenUids.set(accId, new Set())
      }
      const accountSeen = this.seenUids.get(accId)!

      // 1. Read INBOX status (unseen count, total messages, uidNext).
      const status = await emailClient.getMailboxStatus(acc, 'INBOX')
      if (status.ok) {
        this.unreadCounts.set(accId, status.unseen || 0)
      } else if (connectionPolicy.classifyImapError(status.error || '') === 'quota') {
        this.noteQuotaHit(accId, acc.email)
      }

      let validUids: number[] = []
      let hadConnectivityIssue = !status.ok
      try {
        // 2. Fetch recent messages (up to 50) to seed the already-seen set.
        const res = await emailClient.fetchMessages(acc, 'INBOX', 50, false)
        const messages = Array.isArray(res) ? res : (res?.messages || [])
        validUids = messages.map((m: any) => m.uid || 0).filter((u: number) => u > 0)
        for (const u of validUids) {
          accountSeen.add(u)
        }
      } catch (fetchErr: any) {
        hadConnectivityIssue = true
        const kind = connectionPolicy.classifyImapError(fetchErr)
        const detail = fetchErr?.message || String(fetchErr)
        if (kind === 'quota') {
          this.noteQuotaHit(accId, acc.email)
        } else if (kind === 'network') {
          this.noteNetworkBlip(accId, acc.email, detail)
        } else {
          console.warn(`[AccountManager] Prime fetch warning for ${acc.email}:`, detail)
        }
      }

      // 3. Resolve the UID baseline:
      // Per RFC 3501, uidNext is strictly greater than any existing UID.
      let latestUid = 0
      if (status.ok && typeof status.uidNext === 'number' && status.uidNext > 1) {
        latestUid = status.uidNext - 1
      } else if (validUids.length > 0) {
        latestUid = Math.max(...validUids)
      }

      if (!hadConnectivityIssue) this.noteQuotaSuccess(accId)

      this.lastSeenUids.set(accId, latestUid)
      console.log(`[AccountManager] Primed account ${acc.email}. lastSeenUid: ${latestUid}, unseen: ${status.unseen || 0}`)
    } catch (err: any) {
      this.lastSeenUids.set(accId, 0)
      const kind = connectionPolicy.classifyImapError(err)
      const detail = err?.message || String(err)
      if (kind === 'quota') {
        this.noteQuotaHit(accId, acc.email)
      } else if (kind === 'network') {
        this.noteNetworkBlip(accId, acc.email, detail)
      } else {
        console.warn(`[AccountManager] Prime failed for ${acc.email}:`, detail)
      }
    }
  }

  private async primeInitialUids(): Promise<void> {
    for (const [accId, acc] of this.accounts.entries()) {
      await this.primeAccount(accId, acc)
    }
  }

  public async loadAccounts(maxRetries: number = 2): Promise<void> {
    if (this.useHostStorage()) {
      try {
        const rawEnc = await this.readStoredText('accounts', this.accountsFile)
        if (!rawEnc || !rawEnc.trim()) return

        let decrypted = await decryptFromStorage(rawEnc)
        if (!decrypted && maxRetries > 0) {
          // Retry with a delay in case IPC was congested during host bootstrap
          await new Promise((resolve) => setTimeout(resolve, 1500))
          decrypted = await decryptFromStorage(rawEnc)
        }
        if (!decrypted) {
          console.warn('[AccountManager] Could not decrypt accounts (secure storage unavailable?)')
          return
        }

        const list: any[] = JSON.parse(decrypted)
        this.accounts.clear()
        for (const acc of list) {
          this.accounts.set(acc.id, acc)
          if (acc.active && !this.activeAccountId) {
            this.activeAccountId = acc.id
          }
        }
        if (!this.activeAccountId && this.accounts.size > 0) {
          this.activeAccountId = Array.from(this.accounts.keys())[0]
        }
      } catch (err) {
        console.error('[AccountManager] Failed to load accounts:', err)
      }
      return
    }
    try {
      if (!fs.existsSync(this.accountsFile)) {
        return
      }
      const rawEnc = fs.readFileSync(this.accountsFile, 'utf8')
      if (!rawEnc || !rawEnc.trim()) return

      let decrypted = await decryptFromStorage(rawEnc)
      if (!decrypted && maxRetries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        decrypted = await decryptFromStorage(rawEnc)
      }
      if (!decrypted) return

      const list: any[] = JSON.parse(decrypted)
      this.accounts.clear()
      for (const acc of list) {
        this.accounts.set(acc.id, acc)
        if (acc.active && !this.activeAccountId) {
          this.activeAccountId = acc.id
        }
      }
      if (!this.activeAccountId && this.accounts.size > 0) {
        this.activeAccountId = Array.from(this.accounts.keys())[0]
      }
    } catch (err) {
      console.error('[AccountManager] Failed to load accounts:', err)
    }
  }

  public async saveAccounts(): Promise<boolean> {
    try {
      const list = Array.from(this.accounts.values())
      const plain = JSON.stringify(list, null, 2)
      const encrypted = await encryptForStorage(plain)
      if (!encrypted) {
        // No OS keychain available: never write reversible "encryption".
        // Accounts stay usable in memory for this session only.
        console.warn(
          '[AccountManager] Secure storage unavailable; accounts are kept for this session only and will not be persisted'
        )
        return false
      }
      await this.writeStoredText('accounts', encrypted, this.accountsFile)
      return true
    } catch (err) {
      console.error('[AccountManager] Failed to save accounts:', err)
      throw err
    }
  }

  public getPublicAccounts(): any[] {
    return Array.from(this.accounts.values()).map((acc) => {
      const { password, ...rest } = acc
      const avatar = this.avatars.get(acc.id)
      return {
        ...rest,
        ...(avatar ? { avatar } : {}),
        active: acc.id === this.activeAccountId
      }
    })
  }

  /**
   * Resolves the account for a tool call. Accepts an account id or e-mail
   * address (both are documented in the tool contract). An explicit value
   * that matches nothing is an error (null): silently falling back to the
   * active account could send, move or delete a message on the wrong account.
   */
  public getAccountForTool(idOrEmail?: string): any | null {
    if (idOrEmail) {
      if (this.accounts.has(idOrEmail)) return this.accounts.get(idOrEmail)!
      const wanted = String(idOrEmail).trim().toLowerCase()
      for (const account of this.accounts.values()) {
        if (String(account.email || '').trim().toLowerCase() === wanted) return account
      }
      return null
    }
    return this.getAccount()
  }

  public getAccount(id?: string): any | null {
    if (id && this.accounts.has(id)) {
      return this.accounts.get(id)!
    }
    if (this.activeAccountId && this.accounts.has(this.activeAccountId)) {
      return this.accounts.get(this.activeAccountId)!
    }
    if (this.accounts.size > 0) {
      return Array.from(this.accounts.values())[0]
    }
    return null
  }

  public setActiveAccount(id: string): boolean {
    if (!this.accounts.has(id)) return false
    this.activeAccountId = id
    for (const [accId, acc] of this.accounts.entries()) {
      acc.active = accId === id
    }
    this.saveAccounts().catch(() => {})
    return true
  }

  public async addOrUpdateAccount(data: {
    id?: string
    name?: string
    email: string
    password: string
    provider?: string
    rememberPassword?: boolean
    imap?: { host: string; port: number; secure: boolean; user?: string }
    smtp?: { host: string; port: number; secure: boolean; requireTLS?: boolean; user?: string }
  }): Promise<{ ok: boolean; account?: any; error?: string }> {
    const email = data.email.trim()
    const password = data.password.replace(/\s+/g, '') // remove spaces from 16-digit app passwords
    const detected = detectProviderFromEmail(email)
    const providerId = (data.provider || detected) as string
    const preset = (PROVIDERS as any)[providerId] || PROVIDERS.custom

    const id = data.id || `acc_${Buffer.from(email.toLowerCase()).toString('hex').slice(0, 16)}`
    const accountConfig: any = {
      id,
      name: data.name || email.split('@')[0],
      email,
      provider: providerId,
      password,
      imap: {
        host: data.imap?.host || preset.imap.host,
        port: data.imap?.port || preset.imap.port,
        secure: data.imap?.secure ?? preset.imap.secure,
        user: data.imap?.user || email
      },
      smtp: {
        host: data.smtp?.host || preset.smtp.host,
        port: data.smtp?.port || preset.smtp.port,
        secure: data.smtp?.secure ?? preset.smtp.secure,
        requireTLS: data.smtp?.requireTLS ?? preset.smtp.requireTLS,
        user: data.smtp?.user || email
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      active: this.accounts.size === 0 || id === this.activeAccountId,
      status: 'connecting'
    }

    // Test connection
    const test = await emailClient.testAccountConnection(accountConfig)
    if (!test.ok) {
      return { ok: false, error: test.error || 'Falha ao autenticar no servidor de e-mail.' }
    }

    accountConfig.status = 'connected'
    this.accounts.set(id, accountConfig)
    if (!this.activeAccountId) {
      this.activeAccountId = id
    }

    this.removedAvatars.delete(id)
    this.autoAvatarAttempted.delete(id)
    const avatar = await this.getAvatar(id, email).catch(() => null)

    // Seed the UID baseline immediately so older messages never trigger notifications.
    await this.primeAccount(id, accountConfig)

    await this.saveAccounts()
    // The connection form decides whether this password should be remembered
    // for the autofill. Unchecked also clears a previously remembered password.
    if (data.rememberPassword === true) {
      await this.rememberPassword(email, password)
    } else if (data.rememberPassword === false) {
      await this.forgetRememberedPassword(email)
    }
    const { password: _, ...pub } = accountConfig
    if (avatar) pub.avatar = avatar
    return { ok: true, account: pub }
  }

  public async removeAccount(id: string): Promise<boolean> {
    if (!this.accounts.has(id)) return false
    this.accounts.delete(id)
    this.lastSeenUids.delete(id)
    this.seenUids.delete(id)
    this.unreadCounts.delete(id)
    this.clearConnectionState(id)
    try {
      if (typeof emailClient.releaseImapClient === 'function') {
        emailClient.releaseImapClient(id)
      }
    } catch {}
    if (this.activeAccountId === id) {
      const next = Array.from(this.accounts.keys())[0]
      this.activeAccountId = next || null
    }
    // Avatars are preserved across disconnect/reconnect so re-adding the account restores the custom photo.
    await this.saveAccounts()
    return true
  }

  /**
   * Background polling to discover new incoming emails
   */
  private startBackgroundPoller(): void {
    if (this.pollInterval) clearInterval(this.pollInterval)
    this.pollInterval = setInterval(async () => {
      await this.checkAllAccountsForNewEmails()
    }, 15000)
  }

  public async checkAllAccountsForNewEmails(): Promise<void> {
    if (this.isChecking) return
    this.isChecking = true
    try {
      for (const [accId, acc] of this.accounts.entries()) {
        try {
          // Skip background retries while the server limit is cooling down.
          // Foreground user actions still try on demand; only the poller waits.
          if (this.isQuotaCoolingDown(accId)) continue
          if (!this.seenUids.has(accId)) this.seenUids.set(accId, new Set())
          const accountSeen = this.seenUids.get(accId)!

          // Accounts without a UID baseline prime now and skip the cycle.
          // Never emit notifications on the first check of an account.
          if (!this.lastSeenUids.has(accId)) {
            await this.primeAccount(accId, acc)
            continue
          }

          // Fast status check: refreshes the unread count without locking the mailbox.
          const status = await emailClient.getMailboxStatus(acc, 'INBOX')
          if (status.ok) {
            this.unreadCounts.set(accId, status.unseen || 0)
          } else if (connectionPolicy.classifyImapError(status.error || '') === 'quota') {
            this.noteQuotaHit(accId, acc.email)
            continue
          }

          const prevSeen = this.lastSeenUids.get(accId)!

          // Nothing new since the last poll: skip the mailbox read entirely.
          // Gmail caps IMAP downloads at 2500 MB/day and warns that clients
          // which keep repeating actions can reach it, so an idle poll must not
          // open and fetch the inbox again. STATUS already refreshed the badge.
          const uidNext = status.ok ? Number(status.uidNext || 0) : 0
          if (uidNext > 1 && uidNext - 1 <= prevSeen) {
            this.noteQuotaSuccess(accId)
            continue
          }

          // Fetch recent messages (fetchMessages forces client.noop() internally).
          const res = await emailClient.fetchMessages(acc, 'INBOX', 10, false)
          const messages = Array.isArray(res) ? res : (res?.messages || [])
          if (!messages || messages.length === 0) {
            this.noteQuotaSuccess(accId)
            continue
          }

          const validUids = messages.map((m: any) => m.uid || 0).filter((u: number) => u > 0)
          if (validUids.length === 0) {
            this.noteQuotaSuccess(accId)
            continue
          }

          const latestUid = Math.max(...validUids)

          if (latestUid > prevSeen) {
            const newMessages = messages
              .filter((m: any) => {
                const uid = m.uid || 0
                return uid > prevSeen && !accountSeen.has(uid)
              })
              .sort((a: any, b: any) => (a.uid || 0) - (b.uid || 0))

            this.lastSeenUids.set(accId, latestUid)

            if (newMessages.length > 0) {
              // Resolve Gmail's real category for the new arrivals so
              // Primary-only gating does not treat a promotion as Primary.
              // Runs only when mail actually arrived (never on idle polls).
              await emailClient.resolveGmailCategoriesForMessages(acc, newMessages).catch(() => {})
            }

            for (const msg of newMessages) {
              const uid = msg.uid || 0
              accountSeen.add(uid)
              if (accountSeen.size > 500) {
                const first = accountSeen.values().next().value
                if (first !== undefined) accountSeen.delete(first)
              }

              console.log(`[AccountManager] New email detected: ${msg.subject} (UID: ${uid})`)
              if (this.onNewEmailCallback) {
                this.onNewEmailCallback({
                  accountId: accId,
                  email: msg,
                  totalUnread: this.getTotalUnreadCount()
                })
              }
            }
          } else {
            for (const u of validUids) accountSeen.add(u)
          }
          this.noteQuotaSuccess(accId)
        } catch (err: any) {
          const kind = connectionPolicy.classifyImapError(err)
          const detail = err?.message || String(err)
          if (kind === 'quota') {
            this.noteQuotaHit(accId, acc.email)
          } else if (kind === 'network') {
            this.noteNetworkBlip(accId, acc.email, detail)
          } else {
            console.warn(`[AccountManager] Background check error for ${acc.email}:`, detail)
          }
        }
      }
    } finally {
      this.isChecking = false
    }
  }
}

module.exports = {
  AccountManager,
  fetchAccountAvatar
}

