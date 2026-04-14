/**
 * conflictDetector.ts — Detect when two users checked the same item while offline.
 *
 * After the sync engine replays a toggleCheck mutation, this module queries the DB
 * to see if someone else also checked the same item. If so, it adds a ConflictItem
 * to the Zustand store so the ConflictBanner can surface it to the user.
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
 * After successfully syncing a toggleCheck, check if another user also checked
 * this item while offline. Returns a ConflictItem if there is a conflict, null otherwise.
 */
export async function detectToggleConflict(
  itemId: string,
  rfeId: string,
  localUser: string,
  localTimestamp: string,
  itemDescription: string,
): Promise<ConflictItem | null> {
  try {
    const { data, error } = await supabase
      .from('fc_check_state')
      .select('checked_by, updated_at, checked')
      .eq('item_id', itemId)
      .eq('rfe_id', rfeId)
      .single()

    if (error || !data) return null

    const row = data as Pick<CheckState, 'checked_by' | 'updated_at' | 'checked'>

    // A conflict is: item is checked, by a DIFFERENT user, and that DB write
    // happened AFTER our local mutation was made (meaning we both wrote independently)
    if (
      row.checked &&
      row.checked_by &&
      row.checked_by !== localUser &&
      row.updated_at > localTimestamp
    ) {
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

    return null
  } catch (e) {
    console.warn('[conflictDetector] detectToggleConflict failed:', e)
    return null
  }
}
