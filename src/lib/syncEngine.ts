/**
 * syncEngine.ts — Offline mutation queue replay engine.
 *
 * On reconnect (or app start while online), replays all queued mutations
 * in timestamp order against Supabase. Handles conflict detection for
 * toggleCheck mutations.
 */

import { supabase } from './supabase'
import { getQueue, dequeue, incrementRetries } from './offlineQueue'
import {
  detectToggleConflict,
  formatItemDescription,
  buildConflictNote,
  stripConflictPrefix,
} from './conflictDetector'
import type { ConflictItem } from './conflictDetector'
import { saveCheckStates, loadItems } from './offlineStore'
import type { QueueEntry } from './offlineQueue'
import type { Item, DisplayConfig, RFEIndex } from '../types'

// We call into the store but import lazily to avoid circular deps at module init.
// The store reference is set by initSyncEngine().
type StoreRef = {
  loadRFE: (id: string) => Promise<void>
  loadRFEList: () => Promise<void>
  addConflict: (c: import('./conflictDetector').ConflictItem) => void
  broadcastConflict: (c: import('./conflictDetector').ConflictItem) => void
  getCheckStates: () => Map<string, import('../types').CheckState>
  getItems: () => Item[]
  getRFEList: () => RFEIndex[]
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
      case 'setRFEStatus': {
        // Lifecycle status mutation — applied to fc_rfe_index, not fc_check_state.
        const { rfe_id, ...update } = entry.payload as Record<string, unknown>
        const res = await supabase
          .from('fc_rfe_index')
          .update(update)
          .eq('id', rfe_id as string)
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

/**
 * Write the conflict prefix into fc_check_state.note so other devices see
 * the conflict via realtime UPDATE events (or on next loadRFE). Preserves any
 * user note by appending it after the " | " separator, and strips any prior
 * CONFLICT prefix so repeat detections don't stack.
 */
async function persistConflictNote(
  itemId: string,
  rfeId: string,
  localUser: string,
  conflict: ConflictItem,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('fc_check_state')
      .select('note')
      .eq('item_id', itemId)
      .eq('rfe_id', rfeId)
      .maybeSingle()

    if (error) {
      console.warn('[Conflict] Could not read note to persist conflict:', error.message)
      return
    }

    const existing = (data?.note as string | null | undefined) ?? ''
    const stripped = stripConflictPrefix(existing)
    const prefix = buildConflictNote(localUser, conflict.remoteUser, conflict.remoteTimestamp)
    const newNote = prefix + stripped

    // Bump updated_at so the other device's echo guard doesn't skip this UPDATE.
    // Without this, the note-only write carries the same timestamp as the upsert
    // that preceded it, and realtime subscribers with equal-or-newer local state
    // drop the event before the conflict banner can be reconstructed.
    const bumpedTimestamp = new Date().toISOString()

    const { error: updErr } = await supabase
      .from('fc_check_state')
      .update({ note: newNote, updated_at: bumpedTimestamp })
      .eq('item_id', itemId)
      .eq('rfe_id', rfeId)

    if (updErr) {
      console.warn('[Conflict] Failed to persist conflict note:', updErr.message)
    } else {
      console.log('[Conflict] Persisted conflict note for item', itemId, 'at', bumpedTimestamp)
    }
  } catch (e) {
    console.warn('[Conflict] persistConflictNote threw:', e)
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
    let conflictCount = 0

    // Cache items + display_config per rfe so we can format the item description
    // even when the user hasn't opened this RFE in the current session (cold boot).
    const itemsByRfe = new Map<string, Item[]>()
    const configByRfe = new Map<string, DisplayConfig>()

    const resolveDescription = async (rfeId: string, itemId: string): Promise<string> => {
      if (!storeRef) return itemId
      if (!itemsByRfe.has(rfeId)) {
        const inMem = storeRef.getItems().filter(i => i.rfe_id === rfeId)
        const items = inMem.length > 0 ? inMem : ((await loadItems(rfeId)) ?? [])
        itemsByRfe.set(rfeId, items)
      }
      if (!configByRfe.has(rfeId)) {
        const rfe = storeRef.getRFEList().find(r => r.id === rfeId)
        if (rfe?.display_config) configByRfe.set(rfeId, rfe.display_config)
      }
      const item = itemsByRfe.get(rfeId)!.find(i => i.id === itemId)
      return formatItemDescription(item, configByRfe.get(rfeId), itemId)
    }

    for (const entry of queue) {
      // Pre-upsert conflict detection for toggleCheck — must run BEFORE the
      // upsert or our own write clobbers the evidence of the other user's check.
      let conflict: ConflictItem | null = null
      if (
        entry.type === 'toggleCheck' &&
        entry.itemId &&
        storeRef &&
        (entry.payload as { checked?: boolean }).checked === true
      ) {
        const desc = await resolveDescription(entry.rfeId, entry.itemId)

        conflict = await detectToggleConflict(
          entry.itemId,
          entry.rfeId,
          entry.userName,
          entry.timestamp,
          desc,
        )

        if (conflict) {
          storeRef.addConflict(conflict)
          storeRef.broadcastConflict(conflict)
          conflictCount++
        }
      }

      const outcome = await replayEntry(entry)

      if (outcome === 'network') {
        // Still offline — abort replay, will retry on next online event
        console.log('[syncEngine] Network error — stopping replay')
        break
      }

      if (outcome === 'success') {
        await dequeue(entry.id)
        rfeIdsToReconcile.add(entry.rfeId)

        // Persist the conflict to Supabase via the note field. Broadcasts are
        // fire-and-forget; this write is the reliable fallback so any device —
        // even one that missed the broadcast — sees the conflict on next load
        // or via the realtime UPDATE event.
        if (conflict && entry.itemId) {
          await persistConflictNote(entry.itemId, entry.rfeId, entry.userName, conflict)
        }

        if (entry.type === 'toggleCheck' && storeRef) {
          const states = storeRef.getCheckStates()
          await saveCheckStates(entry.rfeId, states)
        }
      }
      // 'error' — mutation was discarded, continue with next
    }

    if (conflictCount > 0) {
      console.log(`[Conflict] Replay complete. ${conflictCount} conflicts detected.`)
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

// useOnlineStatus hook moved to ./useOnlineStatus.ts so it can read the
// reactive pendingCount off the Zustand store without triggering a circular
// module import at init time. This file now only owns the replay engine.
