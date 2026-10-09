import { describe, expect, it } from 'vitest'

const { encryptForStorage, decryptFromStorage } = require('../secure-storage-bridge.ts')

describe('secure storage bridge', () => {
  it('does not persist credentials without the OS keychain', async () => {
    expect(await encryptForStorage('my-secret')).toBeNull()
  })

  it('keeps the empty value contract', async () => {
    expect(await encryptForStorage('')).toBe('')
    expect(await decryptFromStorage('')).toBe('')
  })

  it('returns null (never the ciphertext) when decryption is impossible', async () => {
    expect(await decryptFromStorage('ss:AAAA')).toBeNull()
    expect(await decryptFromStorage('aes:not-valid')).toBeNull()
    const result = await decryptFromStorage('some-ciphertext-without-prefix')
    expect(result).not.toBe('some-ciphertext-without-prefix')
  })
})
