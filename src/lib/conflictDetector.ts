/**
 * conflictDetector.ts — Detect when two users checked the same item while offline.
 *
 * Called BEFORE the sync engine replays a queued toggleCheck. If the DB row already
 * shows the item as checked by a DIFFERENT user, that user checked it while we were
 * offline — a conflict. We record it in the store so the ConflictBanner can surface
 * it, then let the upsert proceed (latest-write-wins for the DB).
 */

import { supabase } from './supabase'
import type { CheckState, Item, DisplayConfig } from '../types'

export interface ConflictItem {
  itemId: string
  rfeId: string
  localUser: string
  remoteUser: string
  localTimestamp: string
  remoteTimestamp: string
  itemDescription: string
}

// ─── Conflict note persistence (survives page reloads / missed broadcasts) ────
// Format: "CONFLICT: Also checked by <user> at <shortTime> | <original note>"
// Stored in fc_check_state.note so any device that loads the row — now or later —
// can reconstruct the conflict banner via parseConflictNote().

const CONFLICT_NOTE_RE = /^CONFLICT: Also checked by (.+?) at (.+?) \| ?([\s\S]*)$/

function formatShortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/** Build the conflict-note prefix. localUser is accepted for API symmetry but
 *  isn't written into the note — the note describes the OTHER party. */
export function buildConflictNote(
  localUser: string,
  remoteUser: string,
  timestamp: string,
): string {
  void localUser
  return `CONFLICT: Also checked by ${remoteUser} at ${formatShortTime(timestamp)} | `
}

/** Parse a stored conflict-note. Returns null if the note isn't a conflict marker. */
export function parseConflictNote(
  note: string | null | undefined,
): { remoteUser: string; remoteTimestamp: string } | null {
  if (!note || !note.startsWith('CONFLICT:')) return null
  const m = note.match(CONFLICT_NOTE_RE)
  if (!m) return null
  return { remoteUser: m[1], remoteTimestamp: m[2] }
}

/** Remove a conflict prefix from a note (leaves plain user note). */
export function stripConflictPrefix(note: string | null | undefined): string {
  if (!note) return ''
  if (!note.startsWith('CONFLICT:')) return note
  const m = note.match(CONFLICT_NOTE_RE)
  return m ? m[3] : note
}

/** Build a human-readable "80049718 - TELESCOPIC FORKLIFT" from an Item + DisplayConfig. */
export function formatItemDescription(
  item: Item | undefined,
  displayConfig: DisplayConfig | undefined,
  fallback: string,
): string {
  if (!item || !displayConfig) return fallback
  const id = item.data[displayConfig.idName]?.trim() || ''
  const desc = item.data[displayConfig.descName]?.trim() || ''
  const sameCol = displayConfig.idName === displayConfig.descName
  if (id && desc && !sameCol) return `${id} - ${desc}`
  return id || desc || fallback
}

/**
 * Pre-upsert check: does the DB already have this item checked by another user?
 * Must be called BEFORE our queued mutation upserts, otherwise our own write
 * clobbers the evidence.
 */
export async function detectToggleConflict(
  itemId: string,
  rfeId: string,
  localUser: string,
  localTimestamp: string,
  itemDescription: string,
): Promise<ConflictItem | null> {
  console.log('[Conflict] Checking item', itemId, 'before replay...')
  try {
    const { data, error } = await supabase
      .from('fc_check_state')
      .select('checked_by, updated_at, checked')
      .eq('item_id', itemId)
      .eq('rfe_id', rfeId)
      .maybeSingle()

    if (error) {
      console.warn('[Conflict] SELECT failed for item', itemId, error.message)
      return null
    }

    if (!data) {
      console.log('[Conflict] No existing row for item', itemId, '— no conflict')
      return null
    }

    const row = data as Pick<CheckState, 'checked_by' | 'updated_at' | 'checked'>

    if (row.checked && row.checked_by) {
      console.log('[Conflict] Found existing check by', row.checked_by, 'at', row.updated_at)
    }

    if (row.checked && row.checked_by && row.checked_by !== localUser) {
      console.log(
        '[Conflict] CONFLICT DETECTED: item', itemId,
        'checked by both', row.checked_by, 'and', localUser,
      )
      return {
        itemId,
        rfeId,
        localUser,
        remoteUser: row.checked_by,
        localTimestamp,
        remoteTimestamp: row.updated_at,
        itemDescription,
      }
    }

    console.log('[Conflict] No conflict for item', itemId)
    return null
  } catch (e) {
    console.warn('[Conflict] detectToggleConflict failed:', e)
    return null
  }
}
