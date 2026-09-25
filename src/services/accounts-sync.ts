// src/services/accounts-sync.ts
// Guards the account list against transient empty worker responses.
// The background worker can answer list_accounts before it finishes loading
// persisted accounts, so an empty reply must not wipe known accounts unless
// no accounts are known or the caller explicitly allows it (account removal).

export interface SyncAccount {
  id: string
}

export function shouldAcceptAccountsResponse(
  next: SyncAccount[],
  known: SyncAccount[],
  allowEmpty = false
): boolean {
  if (next.length > 0) return true
  if (allowEmpty) return true
  return known.length === 0
}
