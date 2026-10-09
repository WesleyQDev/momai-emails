import { afterEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {
  getMessageCacheDir,
  invalidateMessageCache,
  pruneMessageCache,
  setAttachmentsBaseDir,
  MESSAGE_CACHE_MAX_AGE_MS
} from '../email-client'

const account = { id: 'acc_1', email: 'user@example.com' }

function tempBase(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'momai-emails-cache-'))
}

function seedMessageDir(base: string, uid: number, mtime?: Date): string {
  setAttachmentsBaseDir(base)
  const dir = getMessageCacheDir(account, 'INBOX', uid)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'message_parsed.json'), '{"id":"x"}')
  if (mtime) fs.utimesSync(dir, mtime, mtime)
  return dir
}

describe('message cache lifecycle', () => {
  afterEach(() => setAttachmentsBaseDir(null))

  it('invalidates one message cache dir without touching siblings', () => {
    const base = tempBase()
    const keep = seedMessageDir(base, 1)
    const drop = seedMessageDir(base, 2)

    invalidateMessageCache(account, 'INBOX', 2)

    expect(fs.existsSync(drop)).toBe(false)
    expect(fs.existsSync(keep)).toBe(true)
  })

  it('prunes only message dirs older than the retention window', () => {
    const base = tempBase()
    const oldDir = seedMessageDir(base, 10)
    const newDir = seedMessageDir(base, 11)
    const expired = new Date(Date.now() - MESSAGE_CACHE_MAX_AGE_MS - 24 * 60 * 60 * 1000)
    fs.utimesSync(oldDir, expired, expired)

    const removed = pruneMessageCache()

    expect(removed).toBe(1)
    expect(fs.existsSync(oldDir)).toBe(false)
    expect(fs.existsSync(newDir)).toBe(true)
  })

  it('does nothing when the cache base does not exist', () => {
    setAttachmentsBaseDir(path.join(os.tmpdir(), 'momai-emails-missing-cache-base'))
    expect(pruneMessageCache()).toBe(0)
  })
})
