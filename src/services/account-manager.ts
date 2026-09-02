// src/services/account-manager.ts
// Manages multi-account persistence, encryption, active account state, and new email monitoring

const fs = require('node:fs')
const path = require('node:path')
const { encryptForStorage, decryptFromStorage } = require('../../secure-storage-bridge.ts')

import type { EmailAccountConfig, PublicEmailAccount, EmailMessage } from './types'
import { PROVIDERS, detectProviderFromEmail, type ProviderId } from './providers'
import { testAccountConnection, fetchMessages, fetchFullMessage } from './email-client'

export class AccountManager {
  private storageDir: string
  private accountsFile: string
  private accounts: Map<string, EmailAccountConfig> = new Map()
  private activeAccountId: string | null = null
  private pollInterval: any = null
  private lastSeenUids: Map<string, number> = new Map()
  private onNewEmailCallback?: (event: { accountId: string; email: EmailMessage }) => void

  constructor(storageDir?: string) {
    const defaultDataDir = process.env.MOMAI_NODE_CORE_DATA_DIR || process.env.MOMAI_DATA_DIR || path.join(process.cwd(), 'data')
    this.storageDir = storageDir || path.join(defaultDataDir, 'extensions', 'momai-emails')
    this.accountsFile = path.join(this.storageDir, 'accounts.json.enc')
    fs.mkdirSync(this.storageDir, { recursive: true })
  }

  public setOnNewEmail(callback: (event: { accountId: string; email: EmailMessage }) => void) {
    this.onNewEmailCallback = callback
  }

  public async initialize(): Promise<void> {
    await this.loadAccounts()
    this.startBackgroundPoller()
  }

  public async loadAccounts(): Promise<void> {
    try {
      if (!fs.existsSync(this.accountsFile)) {
        return
      }
      const rawEnc = fs.readFileSync(this.accountsFile, 'utf8')
      if (!rawEnc || !rawEnc.trim()) return

      const decrypted = await decryptFromStorage(rawEnc)
      if (!decrypted) return

      const list: EmailAccountConfig[] = JSON.parse(decrypted)
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

  public async saveAccounts(): Promise<void> {
    try {
      const list = Array.from(this.accounts.values())
      const plain = JSON.stringify(list, null, 2)
      const encrypted = await encryptForStorage(plain)
      fs.writeFileSync(this.accountsFile, encrypted, 'utf8')
    } catch (err) {
      console.error('[AccountManager] Failed to save accounts:', err)
      throw err
    }
  }

  public getPublicAccounts(): PublicEmailAccount[] {
    return Array.from(this.accounts.values()).map((acc) => {
      const { password, ...rest } = acc
      return {
        ...rest,
        active: acc.id === this.activeAccountId
      }
    })
  }

  public getAccount(id?: string): EmailAccountConfig | null {
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
    imap?: { host: string; port: number; secure: boolean; user?: string }
    smtp?: { host: string; port: number; secure: boolean; requireTLS?: boolean; user?: string }
  }): Promise<{ ok: boolean; account?: PublicEmailAccount; error?: string }> {
    const email = data.email.trim()
    const password = data.password.replace(/\s+/g, '') // remove spaces from 16-digit app passwords
    const detected = detectProviderFromEmail(email)
    const providerCandidate = ((data.provider || detected) as ProviderId)
    const providerId: ProviderId = (providerCandidate in PROVIDERS) ? providerCandidate : 'custom'
    const preset = PROVIDERS[providerId] || PROVIDERS.custom

    const id = data.id || `acc_${Buffer.from(email).toString('hex').slice(0, 10)}_${Date.now()}`
    const accountConfig: EmailAccountConfig = {
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
    const test = await testAccountConnection(accountConfig)
    if (!test.ok) {
      return { ok: false, error: test.error || 'Falha ao autenticar no servidor de e-mail.' }
    }

    accountConfig.status = 'connected'
    this.accounts.set(id, accountConfig)
    if (!this.activeAccountId) {
      this.activeAccountId = id
    }

    await this.saveAccounts()
    const { password: _, ...pub } = accountConfig
    return { ok: true, account: pub }
  }

  public async removeAccount(id: string): Promise<boolean> {
    if (!this.accounts.has(id)) return false
    this.accounts.delete(id)
    if (this.activeAccountId === id) {
      const next = Array.from(this.accounts.keys())[0]
      this.activeAccountId = next || null
    }
    await this.saveAccounts()
    return true
  }

  /**
   * Background polling to discover new incoming emails
   */
  private startBackgroundPoller(): void {
    if (this.pollInterval) clearInterval(this.pollInterval)
    // Check every 60s for new emails in active accounts
    this.pollInterval = setInterval(async () => {
      await this.checkAllAccountsForNewEmails()
    }, 60000)
    if (typeof this.pollInterval.unref === 'function') {
      this.pollInterval.unref()
    }
  }

  public async checkAllAccountsForNewEmails(): Promise<void> {
    for (const [accId, acc] of this.accounts.entries()) {
      try {
        const messages = await fetchMessages(acc, 'INBOX', 5, false)
        if (messages.length === 0) continue

        const latestUid = Math.max(...messages.map((m) => m.uid))
        const prevSeen = this.lastSeenUids.get(accId)

        if (prevSeen === undefined) {
          this.lastSeenUids.set(accId, latestUid)
          continue
        }

        if (latestUid > prevSeen) {
          // We have new incoming messages!
          const newMessages = messages.filter((m) => m.uid > prevSeen)
          this.lastSeenUids.set(accId, latestUid)

          for (const msg of newMessages) {
            const full = await fetchFullMessage(acc, msg.uid, 'INBOX')
            const toEmit = full || msg
            if (this.onNewEmailCallback) {
              this.onNewEmailCallback({ accountId: accId, email: toEmit })
            }
          }
        }
      } catch (err: any) {
        console.warn(`[AccountManager] Background check error for ${acc.email}:`, err?.message || err)
      }
    }
  }
}
