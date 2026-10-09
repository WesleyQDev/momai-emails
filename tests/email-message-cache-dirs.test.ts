import { describe, it, expect, afterEach } from 'vitest'
import * as path from 'node:path'
import { getMessageCacheDir, setAttachmentsBaseDir } from '../email-client'

describe('getMessageCacheDir (folder-scoped message cache)', () => {
  afterEach(() => {
    setAttachmentsBaseDir(null)
  })

  it('scopes the message cache by account, folder and uid', () => {
    setAttachmentsBaseDir(path.join('C:', 'cache'))
    const account = { email: 'User@Example.com' }

    expect(getMessageCacheDir(account, 'INBOX', 42)).toBe(
      path.join('C:', 'cache', 'user_example_com', 'inbox', '42')
    )
    expect(getMessageCacheDir(account, 'Sent', 42)).toBe(
      path.join('C:', 'cache', 'user_example_com', 'sent', '42')
    )
    expect(getMessageCacheDir(account, 'INBOX', 42)).not.toBe(
      getMessageCacheDir(account, 'Sent', 42)
    )
  })

  it('sanitizes folder paths and message ids into a single portable segment', () => {
    setAttachmentsBaseDir(path.join('C:', 'cache'))

    expect(getMessageCacheDir({ id: 'acc_1' }, '[Gmail]/Todos os E-mails', '<abc@x>')).toBe(
      path.join('C:', 'cache', 'acc_1', '_gmail__todos_os_e-mails', '_abc_x_')
    )
  })

  it('falls back to stable defaults for missing values', () => {
    setAttachmentsBaseDir(path.join('C:', 'cache'))

    expect(getMessageCacheDir({}, '', '')).toBe(path.join('C:', 'cache', 'default', 'inbox', 'unknown'))
  })
})
