/**
 * syncEngine.ts — Offline mutation queue replay engine.
 *
 * On reconnect (or app start while online), replays all queued mutations
 * in timestamp order against Supabase. Handles conflict detection for
 * toggleCheck mutations.
 */

import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getQueue, dequeue, incrementRetries } from './offlineQueue'
import { detectToggleConflict } from './conflictDetector'
import { saveCheckStates } from './offlineStore'
import type { QueueEntry } from './offlineQueue'

// We call into the store but import lazily to avoid circular deps at module init.
// The store reference is set by initSyncEngine().
type StoreRef = {
  loadRFE: (id: string) => Promise<void>
  loadRFEList: () => Promise<void>
  addConflict: (c: import('./conflictDetector').ConflictItem) => void
  getCheckStates: () => Map<string, import('../types').CheckState>
  getItems: () => import('../types').Item[]
}

let storeRef: StoreRef | null = null

export function registerStoreRef(ref: StoreRef) {
  storeRef = ref
}

/** Detect if an error is a network/connectivity issue (should queue, not revert) */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return (
      msg.includes('fetch') ||
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('econnrefused') ||
      msg.includes('failed to fetch') ||
      msg.includes('load failed')
    )
  }
  return false
}

/** Detect if a Supabase response status is a network-level failure */
export function isNetworkStatus(status: number): boolean {
  return status === 0 || status >= 500
}

/** Process one queue entry against Supabase. Returns true if successful. */
async function replayEntry(entry: QueueEntry): Promise<'success' | 'network' | 'error'> {
  try {
    let result: { error: { message: string; code?: string; status?: number } | null; data?: unknown }

    switch (entry.type) {
      case 'toggleCheck':
      case 'updateNote':
      case 'updateQtyFound':
      case 'selectAll': {
        const res = await supabase
          .from('fc_check_state')
          .upsert(entry.payload as Record<string, unknown>, { onConflict: 'rfe_id,item_id' })
          .select()
        result = res
        break
      }
      case 'resetChecks': {
        const { rfe_id, ...update } = entry.payload as Record<string, unknown>
        const res = await supabase
          .from('fc_check_state')
          .update(update)
          .eq('rfe_id', rfe_id as string)
        result = res
        break
      }
      default:
        // Unknown type — discard
        await dequeue(entry.id)
        return 'error'
    }

    if (result.error) {
      const status = (result.error as { status?: number }).status ?? 0
      if (isNetworkStatus(status)) {
        await incrementRetries(entry.id)
        return 'network'
      }
      // Data/schema error — discard to avoid infinite retry
      console.error('[syncEngine] Discarding bad mutation:', entry.type, result.error.message)
      await dequeue(entry.id)
      return 'error'
    }

    return 'success'
  } catch (err) {
    if (isNetworkError(err)) {
      await incrementRetries(entry.id)
      return 'network'
    }
    console.error('[syncEngine] Discarding errored mutation:', entry.type, err)
    await dequeue(entry.id)
    return 'error'
  }
}

let replaying = false

/** Replay all queued mutations, oldest first. Stops on first network error. */
export async function replayQueue(): Promise<void> {
  if (replaying) return
  replaying = true

  try {
    const queue = await getQueue()
    if (queue.length === 0) return

    console.log(`[syncEngine] Replaying ${queue.length} queued mutation(s)`)

    const rfeIdsToReconcile = new Set<string>()

    for (const entry of queue) {
      const outcome = await replayEntry(entry)

      if (outcome === 'network') {
        // Still offline — abort replay, will retry on next online event
        console.log('[syncEngine] Network error — stopping replay')
        break
      }

      if (outcome === 'success') {
        await dequeue(entry.id)
        rfeIdsToReconcile.add(entry.rfeId)

        // Conflict detection for toggleCheck
        if (entry.type === 'toggleCheck' && storeRef && entry.itemId) {
          const items = storeRef.getItems()
          const item = items.find(i => i.id === entry.itemId)
          const desc = item
            ? (Object.values(item.data)[1] ?? Object.values(item.data)[0] ?? entry.itemId)
            : entry.itemId

          const conflict = await detectToggleConflict(
            entry.itemId,
            entry.rfeId,
            entry.userName,
            entry.timestamp,
            String(desc),
          )

          if (conflict) {
            console.log('[syncEngine] Conflict detected for item:', entry.itemId)
            storeRef.addConflict(conflict)
          }

          // Save confirmed state to IDB
          if (storeRef) {
            const states = storeRef.getCheckStates()
            await saveCheckStates(entry.rfeId, states)
          }
        }
      }
      // 'error' — mutation was discarded, continue with next
    }

    // Reconcile local state with server for affected RFEs
    if (storeRef) {
      for (const rfeId of rfeIdsToReconcile) {
        await storeRef.loadRFE(rfeId)
      }
    }
  } finally {
    replaying = false
  }
}

/** Initialize the sync engine: register online/offline listeners, replay on start. */
export function initSyncEngine(): void {
  if (navigator.onLine) {
    // Small delay to let the store register first
    setTimeout(() => replayQueue(), 500)
  }

  window.addEventListener('online', () => {
    console.log('[syncEngine] Back online — replaying queue')
    replayQueue()
  })

  window.addEventListener('offline', () => {
    console.log('[syncEngine] Went offline')
  })
}

// ─── useOnlineStatus hook ─────────────────────────────────────────────────────

import { getQueueCount } from './offlineQueue'

export function useOnlineStatus(): { isOnline: boolean; pendingCount: number } {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    // Poll queue count every 2s so the badge stays fresh
    const interval = setInterval(async () => {
      const count = await getQueueCount()
      setPendingCount(count)
    }, 2000)

    // Initial count
    getQueueCount().then(setPendingCount)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(interval)
    }
  }, [])

  return { isOnline, pendingCount }
}
