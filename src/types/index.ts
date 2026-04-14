export interface RFEIndex {
  id: string
  name: string
  file_name: string
  count: number
  imported_at: string
  headers: string[]
  display_config: DisplayConfig
  created_at: string
}

export interface DisplayConfig {
  descName: string
  idName: string
  ctxNames: string[]
  qtyNames: string[]
  grpName: string | null
}

export interface Item {
  id: string
  rfe_id: string
  item_index: number
  data: Record<string, string>
}

export interface CheckState {
  id: string
  rfe_id: string
  item_id: string
  checked: boolean
  note: string
  checked_at: string | null
  checked_by: string
  updated_at: string
  qty_found?: number | null
}

export type ViewTab = 'checklist' | 'inventory' | 'import' | 'settings'

export type SortMode = 'index' | 'alpha' | 'status'

export interface FilterState {
  group: string | null
  statusFilter: 'all' | 'checked' | 'unchecked'
  sortMode: SortMode
  groupByEnabled: boolean
  sortColumn: string | null
  sortDir: 'asc' | 'desc'
}
