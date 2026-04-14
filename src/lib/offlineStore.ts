/**
 * offlineStore.ts — IndexedDB cache layer via idb-keyval
 * All functions are async and try/catch wrapped.
 * IndexedDB errors NEVER crash the app — they return null and log to console.
 */

import { get, set, del } from 'idb-keyval'
import type { RFEIndex, Item, CheckState, DisplayConfig } from '../types'

// ─── RFE List ────────────────────────────────────────────────────────────────

export async function saveRFEList(list: RFEIndex[]): Promise<void> {
  try {
    await set('fc_rfeList', list)
  } catch (e) {
    console.warn('[offlineStore] saveRFEList failed:', e)
  }
}

export async function loadRFEList(): Promise<RFEIndex[] | null> {
  try {
    const data = await get<RFEIndex[]>('fc_rfeList')
    return data ?? null
  } catch (e) {
    console.warn('[offlineStore] loadRFEList failed:', e)
    return null
  }
}

// ─── Items ───────────────────────────────────────────────────────────────────

export async function saveItems(rfeId: string, items: Item[]): Promise<void> {
  try {
    await set(`fc_items_${rfeId}`, items)
  } catch (e) {
    console.warn('[offlineStore] saveItems failed:', e)
  }
}

export async function loadItems(rfeId: string): Promise<Item[] | null> {
  try {
    const data = await get<Item[]>(`fc_items_${rfeId}`)
    return data ?? null
  } catch (e) {
    console.warn('[offlineStore] loadItems failed:', e)
    return null
  }
}

// ─── Check States ─────────────────────────────────────────────────────────────

export async function saveCheckStates(rfeId: string, states: Map<string, CheckState>): Promise<void> {
  try {
    const arr = Array.from(states.entries())
    await set(`fc_checkStates_${rfeId}`, arr)
  } catch (e) {
    console.warn('[offlineStore] saveCheckStates failed:', e)
  }
}

export async function loadCheckStates(rfeId: string): Promise<Map<string, CheckState> | null> {
  try {
    const arr = await get<[string, CheckState][]>(`fc_checkStates_${rfeId}`)
    if (!arr) return null
    return new Map(arr)
  } catch (e) {
    console.warn('[offlineStore] loadCheckStates failed:', e)
    return null
  }
}

// ─── Display Config ───────────────────────────────────────────────────────────

export async function saveDisplayConfig(rfeId: string, config: DisplayConfig): Promise<void> {
  try {
    await set(`fc_displayConfig_${rfeId}`, config)
  } catch (e) {
    console.warn('[offlineStore] saveDisplayConfig failed:', e)
  }
}

export async function loadDisplayConfig(rfeId: string): Promise<DisplayConfig | null> {
  try {
    const data = await get<DisplayConfig>(`fc_displayConfig_${rfeId}`)
    return data ?? null
  } catch (e) {
    console.warn('[offlineStore] loadDisplayConfig failed:', e)
    return null
  }
}

// ─── Cache Clear ─────────────────────────────────────────────────────────────

export async function clearRFECache(rfeId: string): Promise<void> {
  try {
    await Promise.all([
      del(`fc_items_${rfeId}`),
      del(`fc_checkStates_${rfeId}`),
      del(`fc_displayConfig_${rfeId}`),
    ])
  } catch (e) {
    console.warn('[offlineStore] clearRFECache failed:', e)
  }
}
