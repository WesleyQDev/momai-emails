// src/services/send.ts
// Background send helper: closes the composer synchronously and sends in the background.

/**
 * Closes the composer immediately and runs the send in the background.
 * Failures never reopen the composer; they are reported through onError.
 */
export function closeAndSendInBackground(
  onClose: () => void,
  send: () => Promise<unknown>,
  onError?: (err: unknown) => void,
  onSuccess?: (value: unknown) => void
): boolean {
  onClose()
  try {
    const pending = send()
    if (pending && typeof (pending as Promise<unknown>).then === 'function') {
      ;(pending as Promise<unknown>).then(
        (value: unknown) => {
          try {
            onSuccess?.(value)
          } catch {
            // Success reporting must never throw back into the background task.
          }
        },
        (err: unknown) => {
          try {
            onError?.(err)
          } catch {
            // Error reporting must never throw back into the background task.
          }
        }
      )
    }
  } catch (err: unknown) {
    try {
      onError?.(err)
    } catch {
      // Ignore reporting errors.
    }
  }
  return true
}
