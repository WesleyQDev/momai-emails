// src/services/email-content.ts
// Helpers to decide whether a message already carries a readable body.
// List items carry headers only (no text/html), so the reader must open
// instantly with the header and fill the body in the background.

import type { EmailMessage } from './types'

export function hasReadableBody(msg: EmailMessage | null | undefined): boolean {
  if (!msg) return false
  if (typeof msg.html === 'string' && msg.html.trim().length > 0) return true
  if (typeof msg.text === 'string' && msg.text.trim().length > 0) return true
  return false
}
