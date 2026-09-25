import { describe, it, expect, beforeEach } from 'vitest'
import {
  archiveMessageKey,
  setArchiveOrigin,
  getArchiveOrigin,
  clearArchiveOrigin,
  clearAllArchiveOriginsForTests
} from '../src/services/archive-origins'

describe('archive origins', () => {
  beforeEach(() => {
    clearAllArchiveOriginsForTests()
  })

  it('prefers the stable message id over the temporary uid', () => {
    expect(archiveMessageKey('<abc@mail>', '123')).toBe('<abc@mail>')
    expect(archiveMessageKey('', '123')).toBe('123')
    expect(archiveMessageKey(null, null)).toBeNull()
  })

  it('remembers where an archived message came from', () => {
    setArchiveOrigin('acc1', '<abc@mail>', 'INBOX')
    expect(getArchiveOrigin('acc1', '<abc@mail>')).toBe('INBOX')
  })

  it('forgets the origin after restore', () => {
    setArchiveOrigin('acc1', '<abc@mail>', 'INBOX')
    clearArchiveOrigin('acc1', '<abc@mail>')
    expect(getArchiveOrigin('acc1', '<abc@mail>')).toBeNull()
  })
})
