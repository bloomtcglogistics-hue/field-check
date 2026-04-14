import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import {
  saveRFEList, loadRFEList,
  saveItems, loadItems,
  saveCheckStates, loadCheckStates,
  clearRFECache,
} from '../lib/offlineStore'
import { enqueue, getQueue } from '../lib/offlineQueue'
import { registerStoreRef, replayQueue, isNetworkError, isNetworkStatus } from '../lib/syncEngine'
import type { ConflictItem } from '../lib/conflictDetector'
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

  // Offline conflicts
  conflicts: ConflictItem[]
  addConflict: (c: ConflictItem) => void
  clearConflict: (itemId: string) => void
  clearAllConflicts: () => void

  // CRUD actions
  loadRFEList: () => Promise<void>
  loadRFE: (rfeId: string) => Promise<void>
  toggleCheck: (itemId: string, rfeId: string, checked: boolean, userName: string) => Promise<void>
  updateNote: (itemId: string, rfeId: string, note: string) => Promise<void>
  updateQtyFound: (itemId: string, rfeId: string, qtyFound: number | null) => Promise<void>
  importRFE: (name: string, fileName: string, headers: string[], rows: Record<string, string>[], displayConfig: DisplayConfig) => Promise<string>
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

export const useRealtimeStore = create<RealtimeState>((set, get) => {
  // Register store reference with sync engine so it can call loadRFE + addConflict
  // We do this lazily on first use via a helper at the bottom of this file.

  return {
    rfeList: [],
    items: [],
    checkStates: new Map(),
    rfeCheckCounts: new Map(),
    loading: false,
    importing: false,
    error: null,
    realtimeConnected: false,
    conflicts: [],
    _channels: [],

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
      set(state => ({ conflicts: state.conflicts.filter(c => c.itemId !== itemId) }))
    },
    clearAllConflicts: () => set({ conflicts: [] }),

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
    importRFE: async (name, fileName, headers, rows, displayConfig) => {
      // Import REQUIRES being online — server assigns the UUID
      if (!navigator.onLine) {
        const msg = 'Import requires an internet connection. Please move to an area with signal to import new lists.'
        set({ error: msg, importing: false })
        throw new Error(msg)
      }

      set({ importing: true, error: null })

      try {
        const { data: rfe, error: rfeErr } = await supabase
          .from('fc_rfe_index')
          .insert({ name, file_name: fileName, count: rows.length, headers, display_config: displayConfig })
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
        .channel(`fc_rfe_state_${rfeId}`)
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

              const existing = get().checkStates.get(s.item_id)
              const isResetEvent = s.checked === false && existing?.checked === true

              if (!isResetEvent && existing?.updated_at && existing.updated_at >= s.updated_at) {
                return
              }

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

          // On reconnect, replay any queued mutations
          if (connected) {
            replayQueue()
          }
          // On disconnect, don't show an error — just update status
          // (CLOSED / TIMED_OUT / CHANNEL_ERROR are all non-critical)
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
  getCheckStates: () => useRealtimeStore.getState().checkStates,
  getItems: () => useRealtimeStore.getState().items,
})

// Expose queue for pending-dot checks in ItemCard
export async function getPendingItemIds(): Promise<Set<string>> {
  const queue = await getQueue()
  const ids = new Set<string>()
  for (const entry of queue) {
    if (entry.itemId) ids.add(entry.itemId)
  }
  return ids
}
