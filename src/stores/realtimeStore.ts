import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import {
  saveRFEList, loadRFEList,
  saveItems, loadItems,
  saveCheckStates, loadCheckStates,
  clearRFECache,
} from '../lib/offlineStore'
import { enqueue, getQueue, getQueueCount, subscribeToQueueChanges } from '../lib/offlineQueue'
import { registerStoreRef, replayQueue, isNetworkError, isNetworkStatus } from '../lib/syncEngine'
import type { ConflictItem } from '../lib/conflictDetector'
import { parseConflictNote, formatItemDescription, stripConflictPrefix } from '../lib/conflictDetector'
import type { RFEIndex, Item, CheckState, DisplayConfig } from '../types'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface RealtimeState {
  // Data
  rfeList: RFEIndex[]
  items: Item[]
  checkStates: Map<string, CheckState>
  rfeCheckCounts: Map<string, number>

  // Loading / error
  loading: boolean
  importing: boolean
  error: string | null

  // Realtime connection status
  realtimeConnected: boolean

  // Pending queue state (reactive)
  pendingCount: number
  pendingItemIds: Set<string>
  updatePendingCount: () => Promise<void>

  // Offline conflicts
  conflicts: ConflictItem[]
  addConflict: (c: ConflictItem) => void
  clearConflict: (itemId: string) => void
  clearAllConflicts: () => void
  broadcastConflict: (c: ConflictItem) => void

  // CRUD actions
  loadRFEList: () => Promise<void>
  loadRFE: (rfeId: string) => Promise<void>
  toggleCheck: (itemId: string, rfeId: string, checked: boolean, userName: string) => Promise<void>
  updateNote: (itemId: string, rfeId: string, note: string) => Promise<void>
  updateQtyFound: (itemId: string, rfeId: string, qtyFound: number | null) => Promise<void>
  importRFE: (name: string, fileName: string, headers: string[], rows: Record<string, string>[], displayConfig: DisplayConfig, meta?: { description?: string | null; report_type?: string | null }) => Promise<string>
  deleteRFE: (rfeId: string) => Promise<void>
  resetChecks: (rfeId: string) => Promise<void>
  selectAllFiltered: (itemIds: string[], rfeId: string, checked: boolean, userName: string) => Promise<void>

  // Realtime subscriptions
  subscribeToRFEList: () => void
  subscribeToRFE: (rfeId: string) => void
  unsubscribeAll: () => void

  // Internal channel tracking
  _channels: RealtimeChannel[]
}

const CHUNK = 100

// Safety-net reconnection timer for the check-state channel.
// The Supabase client attempts reconnects internally, but we add a 10s
// watchdog so a stuck CLOSED/TIMED_OUT state still gets retried.
let rfeReconnectTimer: ReturnType<typeof setInterval> | null = null
function clearRfeReconnectTimer(): void {
  if (rfeReconnectTimer) {
    clearInterval(rfeReconnectTimer)
    rfeReconnectTimer = null
  }
}

export const useRealtimeStore = create<RealtimeState>((set, get) => {
  // Register store reference with sync engine so it can call loadRFE + addConflict
  // We do this lazily on first use via a helper at the bottom of this file.

  /** If a row's note carries a CONFLICT: prefix, reconstruct a ConflictItem
   *  from it and add to the store. Used by realtime UPDATEs and loadRFE scans. */
  const applyConflictFromNote = (row: CheckState | undefined | null) => {
    if (!row) return
    const parsed = parseConflictNote(row.note)
    if (!parsed) return
    const existing = get().conflicts.some(c => c.itemId === row.item_id && c.rfeId === row.rfe_id)
    if (existing) return
    const item = get().items.find(i => i.id === row.item_id)
    const rfe = get().rfeList.find(r => r.id === row.rfe_id)
    const desc = formatItemDescription(item, rfe?.display_config, row.item_id)
    console.log('[Conflict] Reconstructing from persisted note for item', row.item_id)
    get().addConflict({
      itemId: row.item_id,
      rfeId: row.rfe_id,
      localUser: parsed.remoteUser,
      remoteUser: row.checked_by,
      localTimestamp: parsed.remoteTimestamp,
      remoteTimestamp: row.updated_at,
      itemDescription: desc,
    })
  }

  /** Scan all current checkStates for CONFLICT-marked notes. */
  const scanCheckStatesForConflicts = () => {
    for (const s of get().checkStates.values()) {
      if (s.note?.startsWith('CONFLICT:')) applyConflictFromNote(s)
    }
  }

  /** Strip the CONFLICT prefix from a row's note in Supabase. Fires a realtime
   *  UPDATE that causes other devices to remove the conflict from their local
   *  banner too. Runs fire-and-forget — callers already did the optimistic
   *  local clear. */
  const clearConflictNoteInSupabase = async (itemId: string, rfeId: string) => {
    try {
      const { data, error } = await supabase
        .from('fc_check_state')
        .select('note')
        .eq('item_id', itemId)
        .eq('rfe_id', rfeId)
        .maybeSingle()

      if (error) {
        console.warn('[Conflict] Dismiss SELECT failed:', error.message)
        return
      }

      const existing = (data?.note as string | null | undefined) ?? ''
      if (!existing.startsWith('CONFLICT:')) return

      const stripped = stripConflictPrefix(existing)
      const { error: updErr } = await supabase
        .from('fc_check_state')
        .update({ note: stripped })
        .eq('item_id', itemId)
        .eq('rfe_id', rfeId)

      if (updErr) {
        console.warn('[Conflict] Dismiss UPDATE failed:', updErr.message)
      } else {
        console.log('[Conflict] Dismissed — stripped note for item', itemId)
      }
    } catch (e) {
      console.warn('[Conflict] clearConflictNoteInSupabase threw:', e)
    }
  }

  return {
    rfeList: [],
    items: [],
    checkStates: new Map(),
    rfeCheckCounts: new Map(),
    loading: false,
    importing: false,
    error: null,
    realtimeConnected: false,
    pendingCount: 0,
    pendingItemIds: new Set<string>(),
    conflicts: [],
    _channels: [],

    // ── Reactive queue status ─────────────────────────────────────────────────
    updatePendingCount: async () => {
      try {
        const queue = await getQueue()
        const ids = new Set<string>()
        for (const entry of queue) {
          if (entry.itemId) ids.add(entry.itemId)
        }
        set({ pendingCount: queue.length, pendingItemIds: ids })
      } catch (e) {
        console.warn('[Queue] updatePendingCount failed:', e)
      }
    },

    // ── Conflict management ──────────────────────────────────────────────────
    addConflict: (c) => {
      set(state => {
        // Don't add duplicates
        const exists = state.conflicts.some(x => x.itemId === c.itemId && x.rfeId === c.rfeId)
        if (exists) return {}
        return { conflicts: [...state.conflicts, c] }
      })
    },
    clearConflict: (itemId) => {
      // Optimistic local clear — user sees instant feedback
      const target = get().conflicts.find(c => c.itemId === itemId)
      set(state => ({ conflicts: state.conflicts.filter(c => c.itemId !== itemId) }))
      if (target) void clearConflictNoteInSupabase(target.itemId, target.rfeId)
    },
    clearAllConflicts: () => {
      const dismissed = get().conflicts
      set({ conflicts: [] })
      for (const c of dismissed) {
        void clearConflictNoteInSupabase(c.itemId, c.rfeId)
      }
    },
    broadcastConflict: (c) => {
      const ch = get()._channels.find(x => x.topic === `realtime:fc_rfe_state_${c.rfeId}`)
      if (!ch) {
        console.warn('[Conflict] No broadcast channel for rfe', c.rfeId)
        return
      }
      ch.send({ type: 'broadcast', event: 'conflict', payload: c })
        .then(() => console.log('[Conflict] Broadcast sent for item', c.itemId))
        .catch(err => console.warn('[Conflict] Broadcast failed:', err))
    },

    // ── Load list of all RFEs ─────────────────────────────────────────────────
    loadRFEList: async () => {
      // 1. Instantly load from IDB cache
      const cached = await loadRFEList()
      if (cached) {
        set({ rfeList: cached, loading: false })
      } else {
        set({ loading: true, error: null })
      }

      // 2. Fetch from Supabase if online
      if (!navigator.onLine) {
        set({ loading: false })
        return
      }

      try {
        const [{ data, error, status: rfeStatus }, { data: countData }] = await Promise.all([
          supabase.from('fc_rfe_index').select('*').order('imported_at', { ascending: false }),
          supabase.from('fc_check_state').select('rfe_id').eq('checked', true),
        ])

        if (error) {
          if (isNetworkStatus(rfeStatus)) {
            console.warn('[loadRFEList] Network error — using cache')
            set({ loading: false })
            return
          }
          set({ error: error.message, loading: false })
          return
        }

        const rfeCheckCounts = new Map<string, number>()
        for (const row of (countData ?? [])) {
          rfeCheckCounts.set(row.rfe_id, (rfeCheckCounts.get(row.rfe_id) ?? 0) + 1)
        }

        const rfeList = (data ?? []) as RFEIndex[]
        set({ rfeList, rfeCheckCounts, loading: false })
        await saveRFEList(rfeList)
      } catch (err) {
        if (isNetworkError(err)) {
          console.warn('[loadRFEList] Network error — using cache')
          set({ loading: false })
          return
        }
        console.error('[loadRFEList]', err)
        set({ loading: false })
      }
    },

    // ── Load items + check states for a specific RFE ─────────────────────────
    loadRFE: async (rfeId: string) => {
      // 1. Load from IDB immediately for instant render
      const [cachedItems, cachedStates] = await Promise.all([
        loadItems(rfeId),
        loadCheckStates(rfeId),
      ])

      if (cachedItems) {
        set({
          items: cachedItems,
          checkStates: cachedStates ?? get().checkStates,
          loading: false,
        })
        scanCheckStatesForConflicts()
      } else {
        const alreadyLoaded = get().items.length > 0 && get().items[0]?.rfe_id === rfeId
        set({ loading: !alreadyLoaded, error: null })
      }

      // 2. Fetch from Supabase if online
      if (!navigator.onLine) {
        set({ loading: false })
        return
      }

      try {
        const [{ data: items, error: iErr, status: iStatus }, { data: states, error: sErr, status: sStatus }] = await Promise.all([
          supabase.from('fc_items').select('*').eq('rfe_id', rfeId).order('item_index'),
          supabase.from('fc_check_state').select('*').eq('rfe_id', rfeId),
        ])

        if (iErr || sErr) {
          const errStatus = iErr ? iStatus : sStatus
          if (isNetworkStatus(errStatus)) {
            console.warn('[loadRFE] Network error — using cache')
            set({ loading: false })
            return
          }
          set({ error: (iErr ?? sErr)!.message, loading: false })
          return
        }

        // Merge: keep local state if same or newer timestamp
        const existingStates = get().checkStates
        const checkStates = new Map<string, CheckState>()
        for (const s of (states ?? []) as CheckState[]) {
          const local = existingStates.get(s.item_id)
          if (local?.updated_at && local.updated_at >= s.updated_at) {
            checkStates.set(s.item_id, local)
          } else {
            checkStates.set(s.item_id, s)
          }
        }

        // Also include any local states for items that don't have a server state yet
        for (const [k, v] of existingStates) {
          if (!checkStates.has(k)) checkStates.set(k, v)
        }

        const itemList = (items ?? []) as Item[]
        set({ items: itemList, checkStates, loading: false })

        // Scan merged state for persisted conflict markers
        scanCheckStatesForConflicts()

        // Save merged state to IDB
        await Promise.all([
          saveItems(rfeId, itemList),
          saveCheckStates(rfeId, checkStates),
        ])
      } catch (err) {
        if (isNetworkError(err)) {
          console.warn('[loadRFE] Network error — using cache')
          set({ loading: false })
          return
        }
        console.error('[loadRFE]', err)
        set({ error: String(err), loading: false })
      }
    },

    // ── Toggle a single item's checked status ─────────────────────────────────
    toggleCheck: async (itemId, rfeId, checked, userName) => {
      const existing = get().checkStates.get(itemId)
      const now = new Date().toISOString()

      const optimistic: CheckState = {
        id: existing?.id ?? '',
        rfe_id: rfeId,
        item_id: itemId,
        checked,
        note: existing?.note ?? '',
        checked_at: checked ? now : (existing?.checked_at ?? null),
        checked_by: checked ? userName : (existing?.checked_by ?? ''),
        updated_at: now,
        qty_found: existing?.qty_found ?? null,
      }

      // 1. Optimistic update
      const map = new Map(get().checkStates)
      map.set(itemId, optimistic)
      set({ checkStates: map })

      // 2. Save to IDB immediately
      await saveCheckStates(rfeId, map)

      const payload = {
        rfe_id: rfeId,
        item_id: itemId,
        checked,
        note: existing?.note ?? '',
        checked_at: checked ? now : null,
        checked_by: checked ? userName : '',
        updated_at: now,
      }

      // 3. Try Supabase
      if (!navigator.onLine) {
        await enqueue({ type: 'toggleCheck', payload, timestamp: now, userName, rfeId, itemId })
        console.log('[toggleCheck] Offline — queued')
        return
      }

      try {
        const { error, status: upsertStatus } = await supabase
          .from('fc_check_state')
          .upsert(payload, { onConflict: 'rfe_id,item_id' })
          .select()

        if (error) {
          if (isNetworkStatus(upsertStatus)) {
            // Network error — keep optimistic, queue
            await enqueue({ type: 'toggleCheck', payload, timestamp: now, userName, rfeId, itemId })
            console.log('[toggleCheck] Network error — queued')
            return
          }
          // Data/schema error — revert
          console.error('[toggleCheck] UPSERT FAILED:', error.message)
          const revertMap = new Map(get().checkStates)
          if (existing) {
            revertMap.set(itemId, existing)
          } else {
            revertMap.delete(itemId)
          }
          set({ checkStates: revertMap })
          await saveCheckStates(rfeId, revertMap)
          return
        }

        // Success — verify SELECT only when online
        const { data: verify, error: vErr } = await supabase
          .from('fc_check_state')
          .select('id, item_id, checked, updated_at')
          .eq('item_id', itemId)
          .eq('rfe_id', rfeId)
          .single()

        if (vErr) {
          console.warn('[toggleCheck] Verify SELECT failed:', vErr.message)
        } else {
          console.log('[toggleCheck] Verified:', verify)
        }
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({ type: 'toggleCheck', payload, timestamp: now, userName, rfeId, itemId })
          console.log('[toggleCheck] Network exception — queued')
          return
        }
        console.error('[toggleCheck] Unexpected error:', err)
      }
    },

    // ── Save note on an item ──────────────────────────────────────────────────
    updateNote: async (itemId, rfeId, note) => {
      const existing = get().checkStates.get(itemId)
      const now = new Date().toISOString()

      const updated: CheckState = {
        id: existing?.id ?? '',
        rfe_id: rfeId,
        item_id: itemId,
        checked: existing?.checked ?? false,
        note,
        checked_at: existing?.checked_at ?? null,
        checked_by: existing?.checked_by ?? '',
        updated_at: now,
        qty_found: existing?.qty_found ?? null,
      }

      const map = new Map(get().checkStates)
      map.set(itemId, updated)
      set({ checkStates: map })
      await saveCheckStates(rfeId, map)

      const payload = {
        rfe_id: rfeId,
        item_id: itemId,
        checked: existing?.checked ?? false,
        note,
        checked_at: existing?.checked_at ?? null,
        checked_by: existing?.checked_by ?? '',
        updated_at: now,
      }

      if (!navigator.onLine) {
        await enqueue({ type: 'updateNote', payload, timestamp: now, userName: existing?.checked_by ?? '', rfeId, itemId })
        return
      }

      try {
        const { error, status: noteStatus } = await supabase
          .from('fc_check_state')
          .upsert(payload, { onConflict: 'rfe_id,item_id' })

        if (error) {
          if (isNetworkStatus(noteStatus)) {
            await enqueue({ type: 'updateNote', payload, timestamp: now, userName: existing?.checked_by ?? '', rfeId, itemId })
            return
          }
          console.error('[updateNote]', error.message)
        }
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({ type: 'updateNote', payload, timestamp: now, userName: existing?.checked_by ?? '', rfeId, itemId })
          return
        }
        console.error('[updateNote] Unexpected error:', err)
      }
    },

    // ── Save qty_found on an item ─────────────────────────────────────────────
    updateQtyFound: async (itemId, rfeId, qtyFound) => {
      const existing = get().checkStates.get(itemId)
      const now = new Date().toISOString()

      const updated: CheckState = {
        id: existing?.id ?? '',
        rfe_id: rfeId,
        item_id: itemId,
        checked: existing?.checked ?? false,
        note: existing?.note ?? '',
        checked_at: existing?.checked_at ?? null,
        checked_by: existing?.checked_by ?? '',
        updated_at: now,
        qty_found: qtyFound,
      }

      const map = new Map(get().checkStates)
      map.set(itemId, updated)
      set({ checkStates: map })
      await saveCheckStates(rfeId, map)

      const payload = {
        rfe_id: rfeId,
        item_id: itemId,
        checked: existing?.checked ?? false,
        note: existing?.note ?? '',
        checked_at: existing?.checked_at ?? null,
        checked_by: existing?.checked_by ?? '',
        updated_at: now,
        qty_found: qtyFound,
      }

      if (!navigator.onLine) {
        await enqueue({ type: 'updateQtyFound', payload, timestamp: now, userName: existing?.checked_by ?? '', rfeId, itemId })
        return
      }

      try {
        const { error, status: qtyStatus } = await supabase
          .from('fc_check_state')
          .upsert(payload, { onConflict: 'rfe_id,item_id' })

        if (error) {
          if (isNetworkStatus(qtyStatus)) {
            await enqueue({ type: 'updateQtyFound', payload, timestamp: now, userName: existing?.checked_by ?? '', rfeId, itemId })
            return
          }
          console.error('[updateQtyFound]', error.message)
        }
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({ type: 'updateQtyFound', payload, timestamp: now, userName: existing?.checked_by ?? '', rfeId, itemId })
          return
        }
        console.error('[updateQtyFound] Unexpected error:', err)
      }
    },

    // ── Import a new RFE from parsed CSV/XLSX ─────────────────────────────────
    importRFE: async (name, fileName, headers, rows, displayConfig, meta) => {
      // Import REQUIRES being online — server assigns the UUID
      if (!navigator.onLine) {
        const msg = 'Import requires an internet connection. Please move to an area with signal to import new lists.'
        set({ error: msg, importing: false })
        throw new Error(msg)
      }

      set({ importing: true, error: null })

      try {
        const insertRow: Record<string, unknown> = {
          name,
          file_name: fileName,
          count: rows.length,
          headers,
          display_config: displayConfig,
        }
        if (meta?.description != null) insertRow.description = meta.description
        if (meta?.report_type != null) insertRow.report_type = meta.report_type

        const { data: rfe, error: rfeErr } = await supabase
          .from('fc_rfe_index')
          .insert(insertRow)
          .select()
          .single()

        if (rfeErr || !rfe) throw new Error(rfeErr?.message ?? 'Failed to create RFE index')

        const items: import('../types').Item[] = []
        for (let i = 0; i < rows.length; i += CHUNK) {
          const batch = rows.slice(i, i + CHUNK).map((data, j) => ({
            rfe_id: rfe.id,
            item_index: i + j,
            data,
          }))
          const { data: inserted, error } = await supabase.from('fc_items').insert(batch).select()
          if (error) throw new Error(`Batch ${i / CHUNK + 1} failed: ${error.message}`)
          if (inserted) items.push(...(inserted as import('../types').Item[]))
        }

        // Cache to IDB for offline use
        await Promise.all([
          saveItems(rfe.id, items),
        ])

        await get().loadRFEList()
        set({ importing: false })
        return rfe.id as string
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        set({ error: msg, importing: false })
        throw err
      }
    },

    // ── Delete an RFE ─────────────────────────────────────────────────────────
    deleteRFE: async (rfeId) => {
      await supabase.from('fc_rfe_index').delete().eq('id', rfeId)
      await clearRFECache(rfeId)
      set(state => ({
        rfeList: state.rfeList.filter(r => r.id !== rfeId),
        items: state.items.length > 0 && state.items[0].rfe_id === rfeId ? [] : state.items,
        checkStates: state.items.length > 0 && state.items[0].rfe_id === rfeId
          ? new Map()
          : state.checkStates,
      }))
    },

    // ── Reset all check marks for an RFE ─────────────────────────────────────
    resetChecks: async (rfeId) => {
      const now = new Date().toISOString()

      const resetPayload = { checked: false, checked_at: null, checked_by: '', note: '', updated_at: now }

      // Optimistic update
      const currentItems = get().items
      if (currentItems.length > 0 && currentItems[0]?.rfe_id === rfeId) {
        const map = new Map<string, CheckState>()
        for (const [k, v] of get().checkStates) {
          map.set(k, { ...v, ...resetPayload })
        }
        set({ checkStates: map })
        await saveCheckStates(rfeId, map)
      }

      const counts = new Map(get().rfeCheckCounts)
      counts.set(rfeId, 0)
      set({ rfeCheckCounts: counts })

      if (!navigator.onLine) {
        await enqueue({
          type: 'resetChecks',
          payload: { rfe_id: rfeId, ...resetPayload },
          timestamp: now,
          userName: '',
          rfeId,
        })
        return
      }

      try {
        const { error, status: resetStatus } = await supabase
          .from('fc_check_state')
          .update(resetPayload)
          .eq('rfe_id', rfeId)

        if (error) {
          if (isNetworkStatus(resetStatus)) {
            await enqueue({
              type: 'resetChecks',
              payload: { rfe_id: rfeId, ...resetPayload },
              timestamp: now,
              userName: '',
              rfeId,
            })
            return
          }
          console.error('[resetChecks]', error.message)
        }
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({
            type: 'resetChecks',
            payload: { rfe_id: rfeId, ...resetPayload },
            timestamp: now,
            userName: '',
            rfeId,
          })
          return
        }
        console.error('[resetChecks] Unexpected error:', err)
      }
    },

    // ── Select/deselect all items in the current filtered view ────────────────
    selectAllFiltered: async (itemIds, rfeId, checked, userName) => {
      const now = new Date().toISOString()

      const upserts = itemIds.map(itemId => ({
        rfe_id: rfeId,
        item_id: itemId,
        checked,
        note: get().checkStates.get(itemId)?.note ?? '',
        checked_at: checked ? now : null,
        checked_by: checked ? userName : '',
        updated_at: now,
      }))

      // Optimistic update
      const map = new Map(get().checkStates)
      for (const u of upserts) {
        const existing = get().checkStates.get(u.item_id)
        map.set(u.item_id, {
          id: existing?.id ?? '',
          qty_found: existing?.qty_found ?? null,
          ...u,
        })
      }
      set({ checkStates: map })
      await saveCheckStates(rfeId, map)

      if (!navigator.onLine) {
        // Queue as individual upserts (chunked by 50)
        for (let i = 0; i < upserts.length; i += 50) {
          const chunk = upserts.slice(i, i + 50)
          for (const u of chunk) {
            await enqueue({
              type: 'selectAll',
              payload: u,
              timestamp: now,
              userName,
              rfeId,
              itemId: u.item_id,
            })
          }
        }
        return
      }

      for (let i = 0; i < upserts.length; i += 50) {
        try {
          const { error, status: batchStatus } = await supabase
            .from('fc_check_state')
            .upsert(upserts.slice(i, i + 50), { onConflict: 'rfe_id,item_id' })

          if (error) {
            if (isNetworkStatus(batchStatus)) {
              // Queue remaining
              for (let j = i; j < upserts.length; j += 50) {
                for (const u of upserts.slice(j, j + 50)) {
                  await enqueue({ type: 'selectAll', payload: u, timestamp: now, userName, rfeId, itemId: u.item_id })
                }
              }
              return
            }
            console.error('[selectAllFiltered] batch error:', error.message)
          }
        } catch (err) {
          if (isNetworkError(err)) {
            for (let j = i; j < upserts.length; j += 50) {
              for (const u of upserts.slice(j, j + 50)) {
                await enqueue({ type: 'selectAll', payload: u, timestamp: now, userName, rfeId, itemId: u.item_id })
              }
            }
            return
          }
          console.error('[selectAllFiltered] Unexpected error:', err)
        }
      }
    },

    // ── Subscribe to real-time updates for the RFE list ──────────────────────
    subscribeToRFEList: () => {
      const existing = get()._channels.filter(c => c.topic === 'realtime:fc_rfe_list')
      if (existing.length > 0) {
        existing.forEach(c => supabase.removeChannel(c))
      }

      const ch = supabase
        .channel('fc_rfe_list')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fc_rfe_index' }, () => {
          get().loadRFEList()
        })
        .subscribe((status) => {
          console.log('[Realtime] fc_rfe_list status:', status)
        })

      set(state => ({
        _channels: [
          ...state._channels.filter(c => c.topic !== 'realtime:fc_rfe_list'),
          ch,
        ],
      }))
    },

    // ── Subscribe to real-time check_state updates for a specific RFE ─────────
    subscribeToRFE: (rfeId: string) => {
      const prev = get()._channels.filter(c => c.topic.startsWith('realtime:fc_rfe_state_'))
      if (prev.length > 0) {
        prev.forEach(c => supabase.removeChannel(c))
      }

      const ch = supabase
        .channel(`fc_rfe_state_${rfeId}`, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'conflict' }, ({ payload }) => {
          const c = payload as ConflictItem
          if (c && c.rfeId === rfeId) {
            console.log('[Conflict] Broadcast received for item', c.itemId, 'from', c.localUser)
            get().addConflict(c)
          }
        })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'fc_check_state' },
          (payload) => {
            // ── 1. Update rfeCheckCounts for ALL rfe_ids ──
            const oldRow = payload.old as Partial<CheckState>
            const newRow = payload.new as Partial<CheckState>
            const eventRfeId = newRow?.rfe_id ?? oldRow?.rfe_id

            if (eventRfeId) {
              const oldChecked = oldRow?.checked
              const newChecked = newRow?.checked
              const counts = new Map(get().rfeCheckCounts)
              const cur = counts.get(eventRfeId) ?? 0

              if (payload.eventType === 'INSERT' && newChecked) {
                counts.set(eventRfeId, cur + 1)
                set({ rfeCheckCounts: counts })
              } else if (payload.eventType === 'UPDATE' && oldChecked !== undefined) {
                if (!oldChecked && newChecked) {
                  counts.set(eventRfeId, cur + 1)
                  set({ rfeCheckCounts: counts })
                } else if (oldChecked && !newChecked) {
                  counts.set(eventRfeId, Math.max(0, cur - 1))
                  set({ rfeCheckCounts: counts })
                }
              } else if (payload.eventType === 'DELETE' && oldChecked) {
                counts.set(eventRfeId, Math.max(0, cur - 1))
                set({ rfeCheckCounts: counts })
              }
            }

            // ── 2. Update checkStates for the active rfeId only ──
            if (payload.eventType === 'DELETE') {
              const deleted = payload.old as CheckState
              if (deleted.rfe_id !== rfeId) return
              const map = new Map(get().checkStates)
              map.delete(deleted.item_id)
              set({ checkStates: map })
              saveCheckStates(rfeId, map)
            } else {
              const s = payload.new as CheckState
              if (s.rfe_id !== rfeId) return

              const existingForLog = get().checkStates.get(s.item_id)
              console.log('[Realtime] RAW UPDATE received:', {
                item_id: s.item_id,
                note: s.note,
                checked_by: s.checked_by,
                updated_at: s.updated_at,
                checked: s.checked,
              })
              console.log('[Realtime] Local state for this item:', {
                updated_at: existingForLog?.updated_at,
                checked_by: existingForLog?.checked_by,
                note: existingForLog?.note,
              })

              const incomingIsConflict = !!s.note?.startsWith('CONFLICT:')
              const localIsConflict = !!existingForLog?.note?.startsWith('CONFLICT:')
              const alreadyInConflicts = get().conflicts.some(
                c => c.itemId === s.item_id && c.rfeId === s.rfe_id,
              )
              console.log('[Realtime] Note check:', {
                incomingIsConflict,
                localIsConflict,
                alreadyInConflicts,
              })

              // Reliable fallback: if the incoming note carries a CONFLICT: prefix,
              // reconstruct the conflict locally. Catches devices that missed the
              // fire-and-forget broadcast.
              if (incomingIsConflict) {
                applyConflictFromNote(s)
              } else if (alreadyInConflicts) {
                // Dismissed on another device — mirror the clear locally.
                console.log('[Conflict] Remote dismissal for item', s.item_id)
                set(state => ({
                  conflicts: state.conflicts.filter(
                    c => !(c.itemId === s.item_id && c.rfeId === s.rfe_id),
                  ),
                }))
              }

              const existing = existingForLog
              const isResetEvent = s.checked === false && existing?.checked === true
              // Special case: a conflict note arriving from another device must
              // always win over the echo guard. Otherwise equal timestamps (from
              // a bumped persistConflictNote write) can cause the local map to
              // keep its stale non-conflict note, leaving the banner stuck off.
              const isConflictArrival = incomingIsConflict && !localIsConflict
              const willSkip =
                !isResetEvent &&
                !isConflictArrival &&
                !!existing?.updated_at &&
                existing.updated_at >= s.updated_at
              console.log('[Realtime] Echo guard decision:', {
                localUpdatedAt: existing?.updated_at,
                remoteUpdatedAt: s.updated_at,
                isResetEvent,
                isConflictArrival,
                willSkip,
              })

              if (willSkip) return

              const map = new Map(get().checkStates)
              map.set(s.item_id, s)
              set({ checkStates: map })
              saveCheckStates(rfeId, map)
            }
          }
        )
        .subscribe((status) => {
          console.log('[Realtime] fc_rfe_state status:', status)
          const connected = status === 'SUBSCRIBED'
          set({ realtimeConnected: connected })

          if (connected) {
            // Clean recovery — kill the watchdog and replay queued mutations
            clearRfeReconnectTimer()
            replayQueue()
            // Also refresh check states in case any UPDATE events were missed
            // while the channel was down
            if (navigator.onLine) {
              get().loadRFE(rfeId).catch(() => { /* best-effort */ })
            }
          } else if (
            status === 'CLOSED' ||
            status === 'CHANNEL_ERROR' ||
            status === 'TIMED_OUT'
          ) {
            // Start a watchdog that re-subscribes every 10s until we're back.
            // The Supabase client usually recovers on its own, but this catches
            // edge cases on mobile where the socket is silently killed (iPad on
            // hotspot switching towers, app backgrounded for a long time, etc).
            if (!rfeReconnectTimer && navigator.onLine) {
              rfeReconnectTimer = setInterval(() => {
                if (get().realtimeConnected) {
                  clearRfeReconnectTimer()
                  return
                }
                if (!navigator.onLine) return
                console.log('[Realtime] Attempting reconnect...')
                get().subscribeToRFE(rfeId)
              }, 10000)
            }
          }
        })

      set(state => ({
        _channels: [
          ...state._channels.filter(c => !c.topic.startsWith('realtime:fc_rfe_state_')),
          ch,
        ],
      }))
    },

    // ── Tear down all subscriptions ───────────────────────────────────────────
    unsubscribeAll: () => {
      clearRfeReconnectTimer()
      get()._channels.forEach(ch => supabase.removeChannel(ch))
      set({ _channels: [], realtimeConnected: false })
    },
  }
})

// Register the store with the sync engine (after store creation)
// This allows syncEngine to call loadRFE and addConflict without circular imports.
registerStoreRef({
  loadRFE: (id) => useRealtimeStore.getState().loadRFE(id),
  loadRFEList: () => useRealtimeStore.getState().loadRFEList(),
  addConflict: (c) => useRealtimeStore.getState().addConflict(c),
  broadcastConflict: (c) => useRealtimeStore.getState().broadcastConflict(c),
  getCheckStates: () => useRealtimeStore.getState().checkStates,
  getItems: () => useRealtimeStore.getState().items,
  getRFEList: () => useRealtimeStore.getState().rfeList,
})

// Keep the store's pendingCount reactive: whenever the queue changes, refresh.
// This means the TopBar pill and ItemCard pending dots update immediately as
// mutations queue up offline or drain on reconnect — no polling needed.
subscribeToQueueChanges(() => {
  useRealtimeStore.getState().updatePendingCount()
})

// Seed pendingCount on load so the UI has the right number before any change.
void getQueueCount().then(n => {
  useRealtimeStore.setState({ pendingCount: n })
  useRealtimeStore.getState().updatePendingCount()
})

/** @deprecated Use store.pendingItemIds instead for reactive updates. */
export async function getPendingItemIds(): Promise<Set<string>> {
  const queue = await getQueue()
  const ids = new Set<string>()
  for (const entry of queue) {
    if (entry.itemId) ids.add(entry.itemId)
  }
  return ids
}
