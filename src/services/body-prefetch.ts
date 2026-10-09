// src/services/body-prefetch.ts
// Low-priority queue that warms full message bodies in the background so
// opening an email never waits on the IMAP download. It reuses the same
// single-flight rules as the header warmer: cached messages are skipped,
// failures are retried a bounded number of times and the queue is capped.

import type { EmailMessage } from './types'

/** Pause between two body fetches so the shared IMAP socket stays responsive. */
export const BODY_PREFETCH_THROTTLE_MS = 150

/** How many messages per folder are warmed right after its headers load. */
export const BODY_PREFETCH_PER_FOLDER = 10

/** How many times a failed body fetch is retried before it is dropped. */
export const BODY_PREFETCH_MAX_ATTEMPTS = 2

/** Hard cap on queued messages to keep renderer memory bounded. */
export const BODY_PREFETCH_MAX_QUEUE = 200

export type BodyPrefetchPriority = 'urgent' | 'low'

export interface BodyPrefetchOptions {
  isCached: (accountId: string, messageId: string) => boolean
  fetchBody: (message: EmailMessage, accountId: string) => Promise<{ ok: boolean; email?: EmailMessage }>
  onBodyLoaded: (accountId: string, message: EmailMessage, email: EmailMessage) => void
  throttleMs?: number
  maxAttempts?: number
}

interface BodyPrefetchTask {
  accountId: string
  message: EmailMessage
}

function taskKey(task: BodyPrefetchTask): string {
  return `${task.accountId}:${task.message.id}`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class BodyPrefetcher {
  private options: BodyPrefetchOptions | null = null
  private queue: BodyPrefetchTask[] = []
  private queuedKeys = new Set<string>()
  private attempts = new Map<string, number>()
  private isRunning = false
  private cancelled = false
  private generation = 0

  public configure(options: BodyPrefetchOptions): void {
    this.options = options
  }

  /**
   * Queues messages for background warming. `urgent` tasks (hover, just-opened
   * message) jump ahead of the low-priority folder queue.
   */
  public enqueue(
    accountId: string,
    messages: EmailMessage[],
    priority: BodyPrefetchPriority = 'low'
  ): void {
    const options = this.options
    if (!options || !accountId) return

    const accepted: BodyPrefetchTask[] = []
    for (const message of messages) {
      if (!message || !message.id) continue
      const task: BodyPrefetchTask = { accountId, message }
      const key = taskKey(task)
      if (this.queuedKeys.has(key)) continue
      if (options.isCached(accountId, message.id)) continue
      this.queuedKeys.add(key)
      accepted.push(task)
    }
    if (accepted.length === 0) return

    if (priority === 'urgent') this.queue.unshift(...accepted)
    else this.queue.push(...accepted)

    this.trimQueue()
    this.cancelled = false
    void this.pump()
  }

  /** Drops the queue and cancels the in-flight fetch (account switch / unmount). */
  public stop(): void {
    this.generation += 1
    this.cancelled = true
    this.isRunning = false
    this.queue = []
    this.queuedKeys.clear()
    this.attempts.clear()
  }

  public get pendingCount(): number {
    return this.queue.length
  }

  private trimQueue(): void {
    while (this.queue.length > BODY_PREFETCH_MAX_QUEUE) {
      const dropped = this.queue.pop()
      if (!dropped) break
      this.queuedKeys.delete(taskKey(dropped))
    }
  }

  private async pump(): Promise<void> {
    if (this.isRunning) return
    const generation = this.generation
    this.isRunning = true

    while (!this.cancelled && this.generation === generation && this.queue.length > 0) {
      const task = this.queue.shift() as BodyPrefetchTask
      const key = taskKey(task)
      const options = this.options
      if (!options) break

      let handled = false
      try {
        if (options.isCached(task.accountId, task.message.id)) {
          handled = true
        } else {
          const res = await options.fetchBody(task.message, task.accountId)
          if (this.cancelled || this.generation !== generation) break
          if (res && res.ok && res.email) {
            options.onBodyLoaded(task.accountId, task.message, res.email)
            handled = true
          }
        }
      } catch {
        handled = false
      }

      if (this.cancelled || this.generation !== generation) break
      if (handled) {
        this.attempts.delete(key)
        this.queuedKeys.delete(key)
      } else {
        this.retry(task)
      }

      const throttle = typeof options.throttleMs === 'number' ? options.throttleMs : BODY_PREFETCH_THROTTLE_MS
      if (throttle > 0 && this.queue.length > 0) await delay(throttle)
    }

    if (this.generation === generation) {
      this.isRunning = false
    }
  }

  private retry(task: BodyPrefetchTask): void {
    const key = taskKey(task)
    const attempts = (this.attempts.get(key) || 0) + 1
    const options = this.options
    const maxAttempts =
      options && typeof options.maxAttempts === 'number' ? options.maxAttempts : BODY_PREFETCH_MAX_ATTEMPTS
    if (attempts < maxAttempts) {
      this.attempts.set(key, attempts)
      this.queue.push(task)
      this.queuedKeys.add(key)
      return
    }
    this.attempts.delete(key)
    this.queuedKeys.delete(key)
  }
}
