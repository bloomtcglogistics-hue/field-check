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

// ── AI Column Mapping ─────────────────────────────────────────────────────
// Canonical AI field names — what the backend can return for a column
export type AIFieldName =
  | 'tag_number'
  | 'item_code'
  | 'ic_number'
  | 'label_number'
  | 'description'
  | 'quantity'
  | 'category'
  | 'type'
  | 'class'
  | 'make'
  | 'model'
  | 'serial_number'
  | 'year'
  | 'status'
  | 'vendor'
  | 'location'
  | 'unknown'
  | string

export interface ColumnMapping {
  field: AIFieldName
  confidence: number
  reason: string
}

export interface DisplayPriorityFromAI {
  primary: string | null
  secondary: string | null
  third: string | null
  scenario: 1 | 2 | 3 | 4
}

export interface AIMappingResult {
  mappings: Record<string, ColumnMapping>
  display_priority: DisplayPriorityFromAI
  unmapped_columns: string[]
  warnings: string[]
}

// Result of computing display priority for a single item (per-row, runtime)
export interface DisplayFields {
  primary: string
  secondary: string | null
  third: string | null
  hiddenSearchable: string[]
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
