import { describe, it, expect, afterEach, vi } from 'vitest'
import { getAttachmentsBaseDir, setAttachmentsBaseDir } from '../email-client'

describe('getAttachmentsBaseDir (unified extension cache)', () => {
  afterEach(() => {
    setAttachmentsBaseDir(null)
    vi.unstubAllEnvs()
  })

  it('uses the unified cache folder when DATA_DIR ends with data', () => {
    vi.stubEnv('MOMAI_DATA_DIR', 'C:\\Users\\wesle\\AppData\\Roaming\\MomAI\\data')
    vi.stubEnv('MOMAI_NODE_CORE_DATA_DIR', '')
    expect(getAttachmentsBaseDir()).toBe(
      'C:\\Users\\wesle\\AppData\\Roaming\\MomAI\\app-cache\\extensions\\momai-emails\\cache\\attachments'
    )
  })

  it('falls back to the OS temp dir without a data dir (old behavior)', () => {
    vi.stubEnv('MOMAI_DATA_DIR', '')
    vi.stubEnv('MOMAI_NODE_CORE_DATA_DIR', '')
    expect(getAttachmentsBaseDir()).toContain('momai-emails-attachments')
  })

  it('uses the mode-scoped cache dir supplied by the host', () => {
    vi.stubEnv('MOMAI_EXTENSION_CACHE_DIR', 'D:\\mode\\cache')
    expect(getAttachmentsBaseDir()).toBe('D:\\mode\\cache\\attachments')
  })

  it('honors an explicit override (tests and custom setups)', () => {
    setAttachmentsBaseDir('D:\\custom\\cache')
    expect(getAttachmentsBaseDir()).toBe('D:\\custom\\cache')
  })
})
