import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { RFEIndex, Item, CheckState, DisplayConfig } from '../types'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface RealtimeState {
  // Data
  rfeList: RFEIndex[]
  items: Item[]
  checkStates: Map<string, CheckState>

  // Loading / error
  loading: boolean
  importing: boolean
  error: string | null

  // Realtime connection status
  realtimeConnected: boolean

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

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  rfeList: [],
  items: [],
  checkStates: new Map(),
  loading: false,
  importing: false,
  error: null,
  realtimeConnected: false,
  _channels: [],

  // ── Load list of all RFEs ──
  loadRFEList: async () => {
    set({ loading: true, error: null })
    const { data, error } = await supabase
      .from('fc_rfe_index')
      .select('*')
      .order('imported_at', { ascending: false })
    if (error) { set({ error: error.message, loading: false }); return }
    set({ rfeList: (data ?? []) as RFEIndex[], loading: false })
  },

  // ── Load all items + check states for a specific RFE ──
  loadRFE: async (rfeId: string) => {
    set({ loading: true, error: null, items: [], checkStates: new Map() })

    const [{ data: items, error: iErr }, { data: states, error: sErr }] = await Promise.all([
      supabase.from('fc_items').select('*').eq('rfe_id', rfeId).order('item_index'),
      supabase.from('fc_check_state').select('*').eq('rfe_id', rfeId),
    ])

    if (iErr || sErr) {
      set({ error: (iErr ?? sErr)!.message, loading: false })
      return
    }

    const checkStates = new Map<string, CheckState>()
    for (const s of (states ?? []) as CheckState[]) {
      checkStates.set(s.item_id, s)
    }

    set({ items: (items ?? []) as Item[], checkStates, loading: false })
  },

  // ── Toggle a single item's checked status ──
  toggleCheck: async (itemId, rfeId, checked, userName) => {
    const existing = get().checkStates.get(itemId)

    // Single timestamp used for BOTH the optimistic update and the DB write.
    // This ensures the echo-guard (existing.updated_at >= payload.updated_at)
    // correctly skips our own realtime echo — equal timestamps → skip.
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

    // Apply optimistic update immediately
    const map = new Map(get().checkStates)
    map.set(itemId, optimistic)
    set({ checkStates: map })

    // Build upsert payload — NOTE: qty_found is intentionally omitted.
    // Including qty_found when the column doesn't yet exist causes a 400 error
    // that silently reverts the optimistic update. qty_found is managed exclusively
    // by updateQtyFound(); omitting it here preserves any existing DB value.
    const payload = {
      rfe_id: rfeId,
      item_id: itemId,
      checked,
      note: existing?.note ?? '',
      checked_at: checked ? now : null,
      checked_by: checked ? userName : '',
      updated_at: now,
    }

    console.log('[toggleCheck] Upserting payload:', payload)

    const { data, error } = await supabase
      .from('fc_check_state')
      .upsert(payload, { onConflict: 'rfe_id,item_id' })
      .select()

    console.log('[toggleCheck] Response — data:', data, 'error:', error)

    if (error) {
      console.error('[toggleCheck] UPSERT FAILED — reverting optimistic update.', error.message, '| details:', error.details, '| hint:', error.hint, '| code:', error.code)
      // Roll back the optimistic update so the UI shows the true DB state
      const revertMap = new Map(get().checkStates)
      if (existing) {
        revertMap.set(itemId, existing)
      } else {
        revertMap.delete(itemId)
      }
      set({ checkStates: revertMap })
      return
    }

    // Verification SELECT — confirms the row is what we expect
    const { data: verify, error: vErr } = await supabase
      .from('fc_check_state')
      .select('id, item_id, checked, updated_at')
      .eq('item_id', itemId)
      .eq('rfe_id', rfeId)
      .single()

    if (vErr) {
      console.warn('[toggleCheck] Verify SELECT failed:', vErr.message)
    } else {
      console.log('[toggleCheck] Verify SELECT result:', verify)
    }
  },

  // ── Save note on an item ──
  updateNote: async (itemId, rfeId, note) => {
    const existing = get().checkStates.get(itemId)
    const now = new Date().toISOString()

    const map = new Map(get().checkStates)
    map.set(itemId, {
      id: existing?.id ?? '',
      rfe_id: rfeId,
      item_id: itemId,
      checked: existing?.checked ?? false,
      note,
      checked_at: existing?.checked_at ?? null,
      checked_by: existing?.checked_by ?? '',
      updated_at: now,
      qty_found: existing?.qty_found ?? null,
    })
    set({ checkStates: map })

    // qty_found intentionally omitted — see toggleCheck for rationale
    const { error } = await supabase.from('fc_check_state').upsert({
      rfe_id: rfeId,
      item_id: itemId,
      checked: existing?.checked ?? false,
      note,
      checked_at: existing?.checked_at ?? null,
      checked_by: existing?.checked_by ?? '',
      updated_at: now,
    }, { onConflict: 'rfe_id,item_id' })

    if (error) console.error('[updateNote]', error.message)
  },

  // ── Save qty_found on an item ──
  // This is the ONLY mutation that writes qty_found to the DB.
  // Requires the qty_found column to exist: ALTER TABLE fc_check_state ADD COLUMN IF NOT EXISTS qty_found integer DEFAULT NULL;
  updateQtyFound: async (itemId, rfeId, qtyFound) => {
    const existing = get().checkStates.get(itemId)
    const now = new Date().toISOString()

    const map = new Map(get().checkStates)
    map.set(itemId, {
      id: existing?.id ?? '',
      rfe_id: rfeId,
      item_id: itemId,
      checked: existing?.checked ?? false,
      note: existing?.note ?? '',
      checked_at: existing?.checked_at ?? null,
      checked_by: existing?.checked_by ?? '',
      updated_at: now,
      qty_found: qtyFound,
    })
    set({ checkStates: map })

    const { error } = await supabase.from('fc_check_state').upsert({
      rfe_id: rfeId,
      item_id: itemId,
      checked: existing?.checked ?? false,
      note: existing?.note ?? '',
      checked_at: existing?.checked_at ?? null,
      checked_by: existing?.checked_by ?? '',
      updated_at: now,
      qty_found: qtyFound,
    }, { onConflict: 'rfe_id,item_id' })

    if (error) console.error('[updateQtyFound]', error.message)
  },

  // ── Import a new RFE from parsed CSV/XLSX ──
  importRFE: async (name, fileName, headers, rows, displayConfig) => {
    set({ importing: true, error: null })

    try {
      const { data: rfe, error: rfeErr } = await supabase
        .from('fc_rfe_index')
        .insert({ name, file_name: fileName, count: rows.length, headers, display_config: displayConfig })
        .select()
        .single()

      if (rfeErr || !rfe) throw new Error(rfeErr?.message ?? 'Failed to create RFE index')

      for (let i = 0; i < rows.length; i += CHUNK) {
        const batch = rows.slice(i, i + CHUNK).map((data, j) => ({
          rfe_id: rfe.id,
          item_index: i + j,
          data,
        }))
        const { error } = await supabase.from('fc_items').insert(batch)
        if (error) throw new Error(`Batch ${i / CHUNK + 1} failed: ${error.message}`)
      }

      await get().loadRFEList()
      set({ importing: false })
      return rfe.id as string
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg, importing: false })
      throw err
    }
  },

  // ── Delete an RFE (CASCADE removes items + check_state) ──
  deleteRFE: async (rfeId) => {
    await supabase.from('fc_rfe_index').delete().eq('id', rfeId)
    set(state => ({
      rfeList: state.rfeList.filter(r => r.id !== rfeId),
      items: state.items.length > 0 && state.items[0].rfe_id === rfeId ? [] : state.items,
      checkStates: state.items.length > 0 && state.items[0].rfe_id === rfeId
        ? new Map()
        : state.checkStates,
    }))
  },

  // ── Reset all check marks for an RFE ──
  resetChecks: async (rfeId) => {
    // qty_found intentionally omitted — preserves qty data on reset, and avoids
    // failure if the qty_found column hasn't been migrated yet
    const { error } = await supabase.from('fc_check_state')
      .update({ checked: false, checked_at: null, checked_by: '', note: '' })
      .eq('rfe_id', rfeId)

    if (error) { console.error('[resetChecks]', error.message); return }

    const map = new Map<string, CheckState>()
    for (const [k, v] of get().checkStates) {
      map.set(k, { ...v, checked: false, checked_at: null, checked_by: '', note: '' })
    }
    set({ checkStates: map })
  },

  // ── Select/deselect all items in the current filtered view ──
  selectAllFiltered: async (itemIds, rfeId, checked, userName) => {
    const now = new Date().toISOString()

    // qty_found intentionally omitted — preserves existing qty values on bulk check
    const upserts = itemIds.map(itemId => ({
      rfe_id: rfeId,
      item_id: itemId,
      checked,
      note: get().checkStates.get(itemId)?.note ?? '',
      checked_at: checked ? now : null,
      checked_by: checked ? userName : '',
      updated_at: now,
    }))

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

    for (let i = 0; i < upserts.length; i += 50) {
      const { error } = await supabase.from('fc_check_state')
        .upsert(upserts.slice(i, i + 50), { onConflict: 'rfe_id,item_id' })
      if (error) console.error('[selectAllFiltered] batch error:', error.message)
    }
  },

  // ── Subscribe to real-time updates for the RFE list ──
  subscribeToRFEList: () => {
    const existing = get()._channels.filter(c => c.topic === 'realtime:fc_rfe_list')
    if (existing.length > 0) {
      console.log('[Realtime] Removing stale fc_rfe_list channel(s):', existing.length)
      existing.forEach(c => supabase.removeChannel(c))
    }

    console.log('[Realtime] Subscribing to fc_rfe_index (RFE list)')

    const ch = supabase
      .channel('fc_rfe_list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fc_rfe_index' }, (payload) => {
        console.log('[Realtime] fc_rfe_index event:', payload.eventType, payload)
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

  // ── Subscribe to real-time check_state updates for a specific RFE ──
  subscribeToRFE: (rfeId: string) => {
    const prev = get()._channels.filter(c => c.topic.startsWith('realtime:fc_rfe_state_'))
    if (prev.length > 0) {
      console.log('[Realtime] Removing stale RFE channel(s):', prev.map(c => c.topic))
      prev.forEach(c => supabase.removeChannel(c))
    }

    console.log('[Realtime] Subscribing to fc_check_state (unfiltered) for rfe_id:', rfeId)

    const ch = supabase
      .channel(`fc_rfe_state_${rfeId}`)
      .on(
        'postgres_changes',
        // No server-side filter — filtered subscriptions silently drop events in some
        // Supabase Realtime configurations even with REPLICA IDENTITY FULL.
        // We filter client-side instead.
        { event: '*', schema: 'public', table: 'fc_check_state' },
        (payload) => {
          console.log('[Realtime] fc_check_state event:', payload.eventType, 'payload:', payload)

          if (payload.eventType === 'DELETE') {
            const deleted = payload.old as CheckState
            if (deleted.rfe_id !== rfeId) return
            console.log('[Realtime] DELETE item_id:', deleted.item_id)
            const map = new Map(get().checkStates)
            map.delete(deleted.item_id)
            set({ checkStates: map })
          } else {
            const s = payload.new as CheckState
            if (s.rfe_id !== rfeId) return

            // Skip if local state is newer OR EQUAL — equal means this is our own
            // optimistic write echoing back (we use the same `now` timestamp for
            // both the optimistic update and the DB write, so they match exactly).
            const existing = get().checkStates.get(s.item_id)
            if (existing?.updated_at && existing.updated_at >= s.updated_at) {
              console.log('[Realtime] Skipping stale/echo event for', s.item_id, '— local:', existing.updated_at, 'remote:', s.updated_at)
              return
            }

            console.log('[Realtime] INSERT/UPDATE item_id:', s.item_id, 'checked:', s.checked)
            const map = new Map(get().checkStates)
            map.set(s.item_id, s)
            set({ checkStates: map })
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] fc_rfe_state status:', status)
        set({ realtimeConnected: status === 'SUBSCRIBED' })
      })

    set(state => ({
      _channels: [
        ...state._channels.filter(c => !c.topic.startsWith('realtime:fc_rfe_state_')),
        ch,
      ],
    }))
  },

  // ── Tear down all subscriptions ──
  unsubscribeAll: () => {
    console.log('[Realtime] Unsubscribing all channels:', get()._channels.map(c => c.topic))
    get()._channels.forEach(ch => supabase.removeChannel(ch))
    set({ _channels: [], realtimeConnected: false })
  },
}))
