// src/services/folder-load.ts
// Verdict for a folder listing response.
//
// A folder that could not be read must never be presented as an empty folder:
// the old flow returned `{ ok: true, messages: [] }` for a mailbox that failed
// to open, so the UI showed "your inbox is clean" while the server still had
// messages, and that false empty page was cached for the next visit.

export interface FolderLoadResponse {
  ok?: boolean
  messages?: unknown[]
  total?: number
  error?: string
  errorCode?: string
}

export type FolderLoadVerdict =
  | { status: 'ok' }
  | { status: 'error'; reason: 'folder_missing' | 'inconsistent' | 'failed' }

/**
 * Decides how a folder listing must be treated.
 *
 * - `folder_missing`: the server does not expose that mailbox.
 * - `inconsistent`: the page came back empty while the server reports messages,
 *   which means the read did not really succeed.
 * - `failed`: any other unsuccessful response.
 */
export function evaluateFolderLoad(res: FolderLoadResponse | null | undefined): FolderLoadVerdict {
  if (!res || res.ok !== true || !Array.isArray(res.messages)) {
    return {
      status: 'error',
      reason: res?.errorCode === 'folder_missing' ? 'folder_missing' : 'failed'
    }
  }
  if (res.messages.length === 0 && typeof res.total === 'number' && res.total > 0) {
    return { status: 'error', reason: 'inconsistent' }
  }
  return { status: 'ok' }
}
