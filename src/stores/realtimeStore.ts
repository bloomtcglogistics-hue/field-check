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
  _pollInterval: ReturnType<typeof setInterval> | null
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
  _pollInterval: null,

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

    const updated: CheckState = {
      id: existing?.id ?? '',
      rfe_id: rfeId,
      item_id: itemId,
      checked,
      note: existing?.note ?? '',
      checked_at: checked ? new Date().toISOString() : (existing?.checked_at ?? null),
      checked_by: checked ? userName : (existing?.checked_by ?? ''),
      updated_at: new Date().toISOString(),
      qty_found: existing?.qty_found ?? null,
    }
    const map = new Map(get().checkStates)
    map.set(itemId, updated)
    set({ checkStates: map })

    const { error } = await supabase.from('fc_check_state').upsert({
      rfe_id: rfeId,
      item_id: itemId,
      checked,
      note: existing?.note ?? '',
      checked_at: checked ? new Date().toISOString() : null,
      checked_by: checked ? userName : '',
      updated_at: new Date().toISOString(),
      qty_found: existing?.qty_found ?? null,
    }, { onConflict: 'rfe_id,item_id' })

    if (error) console.error('[toggleCheck]', error.message)
  },

  // ── Save note on an item ──
  updateNote: async (itemId, rfeId, note) => {
    const existing = get().checkStates.get(itemId)

    const map = new Map(get().checkStates)
    map.set(itemId, {
      id: existing?.id ?? '',
      rfe_id: rfeId,
      item_id: itemId,
      checked: existing?.checked ?? false,
      note,
      checked_at: existing?.checked_at ?? null,
      checked_by: existing?.checked_by ?? '',
      updated_at: new Date().toISOString(),
      qty_found: existing?.qty_found ?? null,
    })
    set({ checkStates: map })

    await supabase.from('fc_check_state').upsert({
      rfe_id: rfeId,
      item_id: itemId,
      checked: existing?.checked ?? false,
      note,
      checked_at: existing?.checked_at ?? null,
      checked_by: existing?.checked_by ?? '',
      updated_at: new Date().toISOString(),
      qty_found: existing?.qty_found ?? null,
    }, { onConflict: 'rfe_id,item_id' })
  },

  // ── Save qty_found on an item ──
  updateQtyFound: async (itemId, rfeId, qtyFound) => {
    const existing = get().checkStates.get(itemId)

    const map = new Map(get().checkStates)
    map.set(itemId, {
      id: existing?.id ?? '',
      rfe_id: rfeId,
      item_id: itemId,
      checked: existing?.checked ?? false,
      note: existing?.note ?? '',
      checked_at: existing?.checked_at ?? null,
      checked_by: existing?.checked_by ?? '',
      updated_at: new Date().toISOString(),
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
      updated_at: new Date().toISOString(),
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
    await supabase.from('fc_check_state')
      .update({ checked: false, checked_at: null, checked_by: '', note: '', qty_found: null })
      .eq('rfe_id', rfeId)

    const map = new Map<string, CheckState>()
    for (const [k, v] of get().checkStates) {
      map.set(k, { ...v, checked: false, checked_at: null, checked_by: '', note: '', qty_found: null })
    }
    set({ checkStates: map })
  },

  // ── Select/deselect all items in the current filtered view ──
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
      qty_found: get().checkStates.get(itemId)?.qty_found ?? null,
    }))

    const map = new Map(get().checkStates)
    for (const u of upserts) {
      map.set(u.item_id, {
        id: get().checkStates.get(u.item_id)?.id ?? '',
        ...u,
      })
    }
    set({ checkStates: map })

    for (let i = 0; i < upserts.length; i += 50) {
      await supabase.from('fc_check_state')
        .upsert(upserts.slice(i, i + 50), { onConflict: 'rfe_id,item_id' })
    }
  },

  // ── Subscribe to real-time updates for the RFE list ──
  subscribeToRFEList: () => {
    // Remove any existing fc_rfe_list channel to avoid stacking duplicates on remount
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
    // Clear any existing poll interval from a previous RFE
    const existingInterval = get()._pollInterval
    if (existingInterval !== null) {
      console.log('[Realtime] Clearing previous poll interval')
      clearInterval(existingInterval)
      set({ _pollInterval: null })
    }

    // Remove previous RFE-specific channels before creating a new one
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
            // Ignore events for other RFEs
            if (deleted.rfe_id !== rfeId) return
            console.log('[Realtime] DELETE item_id:', deleted.item_id)
            const map = new Map(get().checkStates)
            map.delete(deleted.item_id)
            set({ checkStates: map })
          } else {
            const s = payload.new as CheckState
            // Ignore events for other RFEs
            if (s.rfe_id !== rfeId) return
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

    // ── Fallback polling every 5 s ──
    // Guards against missed realtime events (network blips, cold connections, etc.)
    const pollInterval = setInterval(async () => {
      const { data, error } = await supabase
        .from('fc_check_state')
        .select('*')
        .eq('rfe_id', rfeId)

      if (error) {
        console.warn('[Poll] fc_check_state fetch error:', error.message)
        return
      }

      const remote = (data ?? []) as CheckState[]
      const current = get().checkStates

      // Check if anything differs before touching state
      let hasChange = remote.length !== current.size
      if (!hasChange) {
        for (const row of remote) {
          const local = current.get(row.item_id)
          if (
            !local ||
            local.checked !== row.checked ||
            local.note !== row.note ||
            local.qty_found !== row.qty_found ||
            local.updated_at !== row.updated_at
          ) {
            hasChange = true
            break
          }
        }
      }

      if (hasChange) {
        console.log('[Poll] Detected drift — updating checkStates from poll')
        const map = new Map<string, CheckState>()
        for (const row of remote) map.set(row.item_id, row)
        set({ checkStates: map })
      }
    }, 5000)

    set({ _pollInterval: pollInterval })
  },

  // ── Tear down all subscriptions and timers ──
  unsubscribeAll: () => {
    const interval = get()._pollInterval
    if (interval !== null) {
      console.log('[Realtime] Clearing poll interval')
      clearInterval(interval)
    }
    console.log('[Realtime] Unsubscribing all channels:', get()._channels.map(c => c.topic))
    get()._channels.forEach(ch => supabase.removeChannel(ch))
    set({ _channels: [], realtimeConnected: false, _pollInterval: null })
  },
}))
