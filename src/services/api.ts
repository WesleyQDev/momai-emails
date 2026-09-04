// src/services/api.ts
// Frontend API client to communicate with the momai-emails backend worker

import sdk from 'momai:sdk'

export async function executeCommand<T = any>(toolName: string, args: Record<string, any> = {}, timeoutMs = 25000): Promise<T> {
  try {
    const res = await sdk.api.post('/extensions/momai-emails/command', {
      toolName,
      args,
      timeoutMs
    })
    const data = res?.data !== undefined ? res.data : res
    return data as T
  } catch (err: any) {
    const serverError = err?.response?.data?.error || err?.response?.data?.message || err?.message || String(err)
    console.error(`[momai-emails:api] Command ${toolName} failed:`, serverError)
    return { ok: false, error: serverError } as T
  }
}

export const emailApi = {
  // Accounts
  listAccounts: () => executeCommand<{ ok: boolean; accounts: any[] }>('list_accounts'),
  addAccount: (data: any) => executeCommand<{ ok: boolean; account?: any; error?: string }>('add_account', data, 25000),
  removeAccount: (accountId: string) => executeCommand<{ ok: boolean }>('remove_account', { accountId }),
  setActiveAccount: (accountId: string) => executeCommand<{ ok: boolean }>('set_active_account', { accountId }),
  testAccount: (data: any) => executeCommand<{ ok: boolean; error?: string }>('test_account', data, 20000),

  // Folders & Messages
  listFolders: (accountId?: string) => executeCommand<{ ok: boolean; folders: any[] }>('list_folders', { accountId }),
  listEmails: (folder = 'INBOX', accountId?: string, limit = 50, unreadOnly = false, offset = 0) =>
    executeCommand<{ ok: boolean; messages: any[]; folder: string; hasMore?: boolean; total?: number }>('list_emails', { folder, accountId, limit, unreadOnly, offset }),
  readEmail: (messageId: string, folder = 'INBOX', accountId?: string) =>
    executeCommand<{ ok: boolean; email: any }>('read_email', { messageId, folder, accountId }, 20000),
  openAttachment: (data: { messageId: string | number; filename?: string; part?: string; folder?: string; accountId?: string }) =>
    executeCommand<{ ok: boolean; path?: string; filename?: string; error?: string }>('open_attachment', data, 60000),
  saveAttachment: (data: { messageId: string | number; filename?: string; part?: string; folder?: string; accountId?: string }) =>
    executeCommand<{ ok: boolean; savedPath?: string; filename?: string; cancelled?: boolean; error?: string }>('save_attachment', data, 120000),
  getAttachmentPreview: (data: { messageId: string | number; filename?: string; folder?: string; accountId?: string }) =>
    executeCommand<{ ok: boolean; previewDataUrl?: string; filePath?: string; error?: string }>('get_attachment_preview', data, 30000),
  searchEmails: (query: string, folder = 'INBOX', accountId?: string, limit = 200) =>
    executeCommand<{ ok: boolean; messages: any[]; query: string; total?: number }>('search_emails', { query, folder, accountId, limit }, 30000),

  // Actions
  sendEmail: (payload: any) => executeCommand<{ ok: boolean; messageId?: string; error?: string }>('send_email', payload, 30000),
  replyEmail: (payload: any) => executeCommand<{ ok: boolean; messageId?: string; error?: string }>('reply_email', payload, 30000),
  forwardEmail: (payload: any) => executeCommand<{ ok: boolean; messageId?: string; error?: string }>('forward_email', payload, 30000),
  markAsRead: (messageId: string, folder = 'INBOX', accountId?: string) =>
    executeCommand<{ ok: boolean }>('mark_as_read', { messageId, folder, accountId }),
  markAsUnread: (messageId: string, folder = 'INBOX', accountId?: string) =>
    executeCommand<{ ok: boolean }>('mark_as_unread', { messageId, folder, accountId }),
  toggleStarred: (messageId: string, starred: boolean, folder = 'INBOX', accountId?: string) =>
    executeCommand<{ ok: boolean }>('toggle_starred', { messageId, starred, folder, accountId }),
  deleteEmail: (messageId: string, folder = 'INBOX', accountId?: string) =>
    executeCommand<{ ok: boolean }>('delete_email', { messageId, folder, accountId }),
  moveEmail: (messageId: string, toFolder: string, fromFolder = 'INBOX', accountId?: string) =>
    executeCommand<{ ok: boolean }>('move_email', { messageId, toFolder, fromFolder, accountId }),

  sync: () => executeCommand<{ ok: boolean }>('sync')
}
