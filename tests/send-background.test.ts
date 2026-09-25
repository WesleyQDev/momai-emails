import { describe, it, expect, vi } from 'vitest'
import { closeAndSendInBackground } from '../src/services/send'

describe('background send (composer closes immediately)', () => {
  it('closes synchronously without waiting for the send to finish', async () => {
    let resolveSend!: () => void
    const gate = new Promise<void>((resolve) => {
      resolveSend = resolve
    })
    const events: string[] = []
    closeAndSendInBackground(
      () => {
        events.push('close')
      },
      () => {
        events.push('send')
        return gate
      }
    )
    expect(events).toEqual(['close', 'send'])
    resolveSend()
    await gate
    await Promise.resolve()
    expect(events).toEqual(['close', 'send'])
  })

  it('reports a background send failure without reopening the composer', async () => {
    const onError = vi.fn()
    const onClose = vi.fn()
    closeAndSendInBackground(onClose, () => Promise.reject(new Error('offline')), onError)
    expect(onClose).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('reports success without reopening the composer', async () => {
    const onSuccess = vi.fn()
    const onClose = vi.fn()
    closeAndSendInBackground(onClose, () => Promise.resolve({ ok: true }), undefined, onSuccess)
    expect(onClose).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
