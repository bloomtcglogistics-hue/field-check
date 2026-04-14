/**
 * conflictDetector.ts — Detect when two users checked the same item while offline.
 *
 * Called BEFORE the sync engine replays a queued toggleCheck. If the DB row already
 * shows the item as checked by a DIFFERENT user, that user checked it while we were
 * offline — a conflict. We record it in the store so the ConflictBanner can surface
 * it, then let the upsert proceed (latest-write-wins for the DB).
 */

import { supabase } from './supabase'
import type { CheckState } from '../types'

export interface ConflictItem {
  itemId: string
  rfeId: string
  localUser: string
  remoteUser: string
  localTimestamp: string
  remoteTimestamp: string
  itemDescription: string
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
