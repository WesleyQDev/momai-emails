// src/services/auto-retry.ts
// Backoff for automatic folder reloads after a transient failure.
//
// Gmail's IMAP documentation is explicit that clients which keep retrying
// actions can consume the account's bandwidth allowance (2500 MB/day for IMAP
// downloads) and get the account suspended for up to 24 hours. The retry is
// therefore automatic but polite: one bounded request at a time, fast at first
// so a socket blip is invisible, then capped so a server that is down is only
// probed once every 30 seconds. Permanent failures (missing folder, invalid
// credentials, server quota) are not retried at all.

/** Delays before each automatic attempt; the last step repeats. */
export const AUTO_RETRY_DELAYS_MS = [2000, 5000, 10000, 20000, 30000]

/** Delay before the next automatic attempt, clamped to the last step. */
export function nextAutoRetryDelay(attempt: number): number {
  if (!Number.isFinite(attempt) || attempt < 0) return AUTO_RETRY_DELAYS_MS[0]
  const index = Math.min(Math.floor(attempt), AUTO_RETRY_DELAYS_MS.length - 1)
  return AUTO_RETRY_DELAYS_MS[index]
}
