import { describe, it, expect } from 'vitest'
import { STARRED_TONE_CLASS, starredToneClass } from '../src/services/starred-tone'

describe('favorite star tone', () => {
  it('uses the shared theme highlight token when starred', () => {
    expect(starredToneClass(true)).toBe('text-highlight')
    expect(STARRED_TONE_CLASS).toBe('text-highlight')
  })

  it('applies no tone class when unstarred', () => {
    expect(starredToneClass(false)).toBe('')
  })
})
