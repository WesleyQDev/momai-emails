import { describe, expect, it } from 'vitest'
import { buildImapClientOptions, buildSmtpTransportOptions } from '../email-client'

function makeAccount(overrides: any = {}) {
  return {
    email: 'user@example.com',
    password: 'secret',
    imap: { host: 'imap.example.com', port: 993, secure: true },
    smtp: { host: 'smtp.example.com', port: 465, secure: true, requireTLS: false },
    ...overrides
  }
}

describe('transport security options', () => {
  it('never disables certificate verification', () => {
    const imap = buildImapClientOptions(makeAccount())
    const smtp = buildSmtpTransportOptions(makeAccount())
    expect(imap.tls).toBeUndefined()
    expect(smtp.tls).toBeUndefined()
  })

  it('forces STARTTLS on non-secure IMAP ports and leaves secure ports untouched', () => {
    const insecure = buildImapClientOptions(
      makeAccount({ imap: { host: 'imap.example.com', port: 143, secure: false } })
    )
    expect(insecure.doSTARTTLS).toBe(true)

    const secure = buildImapClientOptions(makeAccount())
    expect(secure.doSTARTTLS).toBeUndefined()
  })

  it('requires STARTTLS on non-secure SMTP ports when the account asks for it', () => {
    const smtp = buildSmtpTransportOptions(
      makeAccount({ smtp: { host: 'smtp.example.com', port: 587, secure: false, requireTLS: true } })
    )
    expect(smtp.requireTLS).toBe(true)
    expect(smtp.secure).toBe(false)
  })

  it('does not invent STARTTLS when the account did not opt in', () => {
    const smtp = buildSmtpTransportOptions(
      makeAccount({ smtp: { host: 'smtp.example.com', port: 2525, secure: false, requireTLS: false } })
    )
    expect(smtp.requireTLS).toBe(false)
  })
})
