/**
 * offlineQueue.ts — Persistent mutation queue stored in IndexedDB
 * Mutations made while offline are enqueued here and replayed when back online.
 */

import { get, set } from 'idb-keyval'

export interface QueueEntry {
  id: string
  type: 'toggleCheck' | 'updateNote' | 'updateQtyFound' | 'resetChecks' | 'selectAll'
  payload: Record<string, unknown>
  timestamp: string
  userName: string
  rfeId: string
  itemId?: string
  retries: number
}

const QUEUE_KEY = 'fc_pendingQueue'

// ─── Change notifier (reactive pending count) ─────────────────────────────────
type Listener = () => void
const listeners = new Set<Listener>()

export function subscribeToQueueChanges(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notifyQueueChanged(): void {
  for (const fn of listeners) {
    try { fn() } catch (e) { console.warn('[Queue] listener threw:', e) }
  }
}

async function readQueue(): Promise<QueueEntry[]> {
  try {
    const q = await get<QueueEntry[]>(QUEUE_KEY)
    return q ?? []
  } catch (e) {
    console.warn('[offlineQueue] readQueue failed:', e)
    return []
  }
}

async function writeQueue(q: QueueEntry[]): Promise<void> {
  try {
    await set(QUEUE_KEY, q)
  } catch (e) {
    console.warn('[offlineQueue] writeQueue failed:', e)
  }
}

export async function enqueue(mutation: Omit<QueueEntry, 'id' | 'retries'>): Promise<void> {
  const entry: QueueEntry = {
    ...mutation,
    id: crypto.randomUUID(),
    retries: 0,
  }
  const q = await readQueue()
  q.push(entry)
  await writeQueue(q)
  console.log('[Queue] Enqueued:', entry.type, entry.itemId ?? entry.rfeId)
  notifyQueueChanged()
}

export async function dequeue(id: string): Promise<void> {
  const q = await readQueue()
  await writeQueue(q.filter(e => e.id !== id))
  notifyQueueChanged()
}

export async function incrementRetries(id: string): Promise<void> {
  const q = await readQueue()
  const updated = q.map(e => e.id === id ? { ...e, retries: e.retries + 1 } : e)
  await writeQueue(updated)
  notifyQueueChanged()
}

export async function getQueue(): Promise<QueueEntry[]> {
  const q = await readQueue()
  return [...q].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

export async function getQueueCount(): Promise<number> {
  const q = await readQueue()
  return q.length
}

export async function clearQueue(): Promise<void> {
  await writeQueue([])
  notifyQueueChanged()
}
