// account-manager.ts
// Manages multi-account persistence, encryption, active account state, and new email monitoring
// Pure CommonJS + erasable TypeScript

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { encryptForStorage, decryptFromStorage } = require('./secure-storage-bridge.ts')
const { PROVIDERS, detectProviderFromEmail } = require('./providers-data.ts')
const { testAccountConnection, fetchMessages, fetchFullMessage, getMailboxStatus } = require('./email-client.ts')

class AccountManager {
  private storageDir: string
  private accountsFile: string
  private accounts: Map<string, any> = new Map()
  private activeAccountId: string | null = null
  private pollInterval: any = null
  private lastSeenUids: Map<string, number> = new Map()
  private seenUids: Map<string, Set<number>> = new Map()
  private unreadCounts: Map<string, number> = new Map()
  private isChecking = false
  private onNewEmailCallback?: (event: { accountId: string; email: any; totalUnread: number }) => void

  constructor(storageDir?: string) {
    const defaultDataDir = process.env.MOMAI_NODE_CORE_DATA_DIR || process.env.MOMAI_DATA_DIR || path.join(process.cwd(), 'data')
    this.storageDir = storageDir || path.join(defaultDataDir, 'extensions', 'momai-emails')
    this.accountsFile = path.join(this.storageDir, 'accounts.json.enc')
    fs.mkdirSync(this.storageDir, { recursive: true })
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

  public async initialize(): Promise<void> {
    await this.loadAccounts()
    await this.primeInitialUids()
    this.startBackgroundPoller()
  }

  private async primeInitialUids(): Promise<void> {
    for (const [accId, acc] of this.accounts.entries()) {
      try {
        if (!this.seenUids.has(accId)) this.seenUids.set(accId, new Set())
        const status = await getMailboxStatus(acc, 'INBOX')
        if (status.ok) {
          this.unreadCounts.set(accId, status.unseen || 0)
        }
        const res = await fetchMessages(acc, 'INBOX', 10, false)
        const messages = Array.isArray(res) ? res : (res?.messages || [])
        if (messages && messages.length > 0) {
          const uids = messages.map((m: any) => m.uid || 0).filter((u: number) => u > 0)
          for (const u of uids) this.seenUids.get(accId)!.add(u)
          const latestUid = uids.length > 0 ? Math.max(...uids) : 0
          this.lastSeenUids.set(accId, latestUid)
          console.log(`[AccountManager] Account ${acc.email} primed with UID: ${latestUid}, unread: ${status.unseen || 0}`)
        } else {
          this.lastSeenUids.set(accId, 0)
        }
      } catch (err: any) {
        console.warn(`[AccountManager] Failed to prime UID for ${acc.email}:`, err?.message || err)
        this.lastSeenUids.set(accId, 0)
      }
    }
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

  public getPublicAccounts(): any[] {
    return Array.from(this.accounts.values()).map((acc) => {
      const { password, ...rest } = acc
      return {
        ...rest,
        active: acc.id === this.activeAccountId
      }
    })
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
    imap?: { host: string; port: number; secure: boolean; user?: string }
    smtp?: { host: string; port: number; secure: boolean; requireTLS?: boolean; user?: string }
  }): Promise<{ ok: boolean; account?: any; error?: string }> {
    const email = data.email.trim()
    const password = data.password.replace(/\s+/g, '') // remove spaces from 16-digit app passwords
    const detected = detectProviderFromEmail(email)
    const providerId = (data.provider || detected) as string
    const preset = (PROVIDERS as any)[providerId] || PROVIDERS.custom

    const id = data.id || `acc_${Buffer.from(email).toString('hex').slice(0, 10)}_${Date.now()}`
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
          if (!this.seenUids.has(accId)) this.seenUids.set(accId, new Set())
          const accountSeen = this.seenUids.get(accId)!

          // Status check: rápido, obtém contagem de não lidos atualizada sem bloquear a caixa
          const status = await getMailboxStatus(acc, 'INBOX')
          if (status.ok) {
            this.unreadCounts.set(accId, status.unseen || 0)
          }

          const prevSeen = this.lastSeenUids.get(accId) ?? 0

          // Busca as mensagens mais recentes (o fetchMessages agora força client.noop() internamente)
          const res = await fetchMessages(acc, 'INBOX', 10, false)
          const messages = Array.isArray(res) ? res : (res?.messages || [])
          if (!messages || messages.length === 0) continue

          const validUids = messages.map((m: any) => m.uid || 0).filter((u: number) => u > 0)
          if (validUids.length === 0) continue

          const latestUid = Math.max(...validUids)

          if (latestUid > prevSeen) {
            const newMessages = messages.filter((m: any) => {
              const uid = m.uid || 0
              return uid > prevSeen && !accountSeen.has(uid)
            })

            this.lastSeenUids.set(accId, latestUid)

            for (const msg of newMessages) {
              const uid = msg.uid || 0
              accountSeen.add(uid)
              if (accountSeen.size > 500) {
                const first = accountSeen.values().next().value
                if (first !== undefined) accountSeen.delete(first)
              }

              console.log(`[AccountManager] Novo e-mail detectado: ${msg.subject} (UID: ${uid})`)
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
        } catch (err: any) {
          console.warn(`[AccountManager] Background check error for ${acc.email}:`, err?.message || err)
        }
      }
    } finally {
      this.isChecking = false
    }
  }
}

module.exports = {
  AccountManager
}
