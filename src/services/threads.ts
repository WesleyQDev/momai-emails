// src/services/threads.ts
// Groups related email messages into conversation threads using In-Reply-To
// headers and normalized subject + participant matching.

import type { EmailMessage } from './types'

export interface EmailThread {
  id: string
  representative: EmailMessage
  messages: EmailMessage[]
  count: number
}

export interface ThreadGroupOptions {
  /** Group all messages from the same sender address into one thread (default: true). */
  groupBySender?: boolean
  /** Exclude this address (e.g. current account's own email) from sender-only grouping. */
  selfAddress?: string
}

const REPLY_PREFIX_RE = /^(?:(?:re|fwd?|res|enc|aw|sv|rv)\s*:\s*)+/i

function normalizeMessageId(id?: string): string {
  return (id || '').trim().toLowerCase()
}

export function normalizeThreadSubject(subject?: string): string {
  const cleaned = (subject || '').replace(REPLY_PREFIX_RE, '').trim().toLowerCase()
  return cleaned.replace(/\s+/g, ' ')
}

function isReplySubject(subject?: string): boolean {
  return REPLY_PREFIX_RE.test((subject || '').trim())
}

function getParticipantAddresses(msg: EmailMessage): Set<string> {
  const addrs = new Set<string>()
  const fromAddr = msg.from?.address?.trim().toLowerCase()
  if (fromAddr) addrs.add(fromAddr)
  for (const r of msg.to || []) {
    const addr = r?.address?.trim().toLowerCase()
    if (addr) addrs.add(addr)
  }
  return addrs
}

function sharesParticipant(a: Set<string>, b: Set<string>): boolean {
  for (const addr of a) {
    if (b.has(addr)) return true
  }
  return false
}

/**
 * Groups flat EmailMessage items into conversation threads ordered by most
 * recent message timestamp descending.
 */
export function groupEmailsIntoThreads(
  messages: EmailMessage[],
  options: ThreadGroupOptions = {}
): EmailThread[] {
  if (messages.length === 0) return []

  const n = messages.length
  const parent = Array.from({ length: n }, (_, i) => i)

  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }

  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  // 1. Link by Message-ID / In-Reply-To
  const byMessageId = new Map<string, number>()
  const byInReplyTo = new Map<string, number>()

  for (let i = 0; i < n; i++) {
    const msgId = normalizeMessageId(messages[i].messageId)
    if (msgId && !byMessageId.has(msgId)) {
      byMessageId.set(msgId, i)
    }
  }

  for (let i = 0; i < n; i++) {
    const replyTo = normalizeMessageId(messages[i].inReplyTo)
    if (!replyTo) continue
    const targetIdx = byMessageId.get(replyTo)
    if (targetIdx !== undefined) {
      union(targetIdx, i)
    }
    const prevIdx = byInReplyTo.get(replyTo)
    if (prevIdx !== undefined) {
      union(prevIdx, i)
    } else {
      byInReplyTo.set(replyTo, i)
    }
  }

  // 2. Link by normalized subject when participants overlap or at least one is a reply
  const bySubject = new Map<string, Array<{ idx: number; participants: Set<string>; isReply: boolean }>>()
  for (let i = 0; i < n; i++) {
    const normSubj = normalizeThreadSubject(messages[i].subject)
    if (!normSubj || normSubj === '(sem assunto)' || normSubj === '(no subject)') continue
    const entry = {
      idx: i,
      participants: getParticipantAddresses(messages[i]),
      isReply: isReplySubject(messages[i].subject) || Boolean(messages[i].inReplyTo)
    }
    const group = bySubject.get(normSubj)
    if (!group) {
      bySubject.set(normSubj, [entry])
      continue
    }
    for (const other of group) {
      if (
        sharesParticipant(entry.participants, other.participants) &&
        (entry.isReply || other.isReply)
      ) {
        union(other.idx, entry.idx)
        break
      }
    }
    group.push(entry)
  }

  // 2.5. Group messages from the same sender (even with different subjects)
  if (options.groupBySender !== false) {
    const selfAddr = options.selfAddress?.trim().toLowerCase() || ''
    const bySender = new Map<string, number>()
    for (let i = 0; i < n; i++) {
      const fromAddr = messages[i].from?.address?.trim().toLowerCase() || ''
      if (!fromAddr || (selfAddr && fromAddr === selfAddr)) continue
      const firstIdx = bySender.get(fromAddr)
      if (firstIdx !== undefined) {
        union(firstIdx, i)
      } else {
        bySender.set(fromAddr, i)
      }
    }
  }

  // 3. Collect buckets
  const buckets = new Map<number, EmailMessage[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    let arr = buckets.get(root)
    if (!arr) {
      arr = []
      buckets.set(root, arr)
    }
    arr.push(messages[i])
  }

  const threads: EmailThread[] = []
  for (const group of buckets.values()) {
    const sortedAsc = [...group].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0) || (a.uid || 0) - (b.uid || 0))
    const latest = sortedAsc[sortedAsc.length - 1]
    const anyUnread = sortedAsc.some((m) => !m.read)
    const anyStarred = sortedAsc.some((m) => m.starred)
    const anyAttachments = sortedAsc.some((m) => m.hasAttachments || (m.attachments?.length ?? 0) > 0)

    const representative: EmailMessage =
      sortedAsc.length === 1
        ? latest
        : {
            ...latest,
            read: !anyUnread,
            starred: anyStarred,
            hasAttachments: anyAttachments
          }

    threads.push({
      id: representative.id,
      representative,
      messages: sortedAsc,
      count: sortedAsc.length
    })
  }

  threads.sort((a, b) => (b.representative.timestamp || 0) - (a.representative.timestamp || 0))
  return threads
}

/** Finds all messages in the same thread as `target` from a flat message list. */
export function getThreadMessagesForEmail(
  messages: EmailMessage[],
  target: EmailMessage | null,
  options: ThreadGroupOptions = {}
): EmailMessage[] {
  if (!target) return []
  const threads = groupEmailsIntoThreads(messages, options)
  const found = threads.find((t) => t.messages.some((m) => m.id === target.id))
  return found ? found.messages : [target]
}

