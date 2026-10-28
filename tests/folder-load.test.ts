import { describe, it, expect } from 'vitest'
import { evaluateFolderLoad } from '../src/services/folder-load'

describe('folder load verdict', () => {
  it('accepts a real page of messages', () => {
    expect(evaluateFolderLoad({ ok: true, messages: [{ id: '1' }], total: 1 })).toEqual({ status: 'ok' })
  })

  it('accepts an empty page when the server confirms the folder is empty', () => {
    expect(evaluateFolderLoad({ ok: true, messages: [], total: 0 })).toEqual({ status: 'ok' })
    expect(evaluateFolderLoad({ ok: true, messages: [] })).toEqual({ status: 'ok' })
  })

  it('never accepts an empty page while the server reports messages', () => {
    expect(evaluateFolderLoad({ ok: true, messages: [], total: 16 })).toEqual({
      status: 'error',
      reason: 'inconsistent'
    })
  })

  it('reports a failed listing instead of an empty folder', () => {
    expect(evaluateFolderLoad({ ok: false, messages: [], error: 'IMAP timeout' })).toEqual({
      status: 'error',
      reason: 'failed'
    })
    expect(evaluateFolderLoad(null)).toEqual({ status: 'error', reason: 'failed' })
    expect(evaluateFolderLoad(undefined)).toEqual({ status: 'error', reason: 'failed' })
  })

  it('distinguishes a folder the server does not have', () => {
    expect(
      evaluateFolderLoad({ ok: false, messages: [], error: 'Unknown Mailbox', errorCode: 'folder_missing' })
    ).toEqual({ status: 'error', reason: 'folder_missing' })
  })
})
