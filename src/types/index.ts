/** Lifecycle state for a checklist (RFE).
 *  - active: in-progress, fully editable (default for new imports)
 *  - draft:  paused/saved-for-later, fully editable, visually distinct
 *  - finalized: locked/read-only; can be re-opened with confirmation */
export type RFEStatus = 'active' | 'draft' | 'finalized'

export interface RFEIndex {
  id: string
  name: string
  file_name: string
  count: number
  imported_at: string
  headers: string[]
  display_config: DisplayConfig
  created_at: string
  /** User-entered description at import time (e.g. "Night shift piping materials"). */
  description?: string | null
  /** Derived report type — drives PDF title. See src/lib/reportType.ts */
  report_type?: string | null
  /** User-entered external reference for the list (e.g. "RFE-2024-001", "Job #12345"). */
  reference_id?: string | null
  /** Lifecycle state — defaults to 'active' if column not yet migrated. */
  status?: RFEStatus
  status_updated_at?: string | null
  status_updated_by?: string | null
}

export interface DisplayConfig {
  descName: string
  idName: string
  ctxNames: string[]
  qtyNames: string[]
  grpName: string | null
  /** Optional map from original header → canonical AI field name. Populated when
   *  the RFE was imported with AI-enhanced mapping. Lets display-priority logic
   *  reason about field TYPES (item_code, tag_number) instead of just columns. */
  aiFieldMap?: Record<string, string>
  /** Optional per-header composite spec so rendering code can surface useful
   *  sub-parts (e.g., equipment_code) instead of the ugly joined composite ID. */
  compositeParts?: Record<string, { separator: string; parts: string[] }>
  /** Persisted backend display-priority scenario from the AI import. When
   *  present and === 4, the card renderer skips identifier lookups entirely
   *  and goes straight to description / placeholder — honoring the backend's
   *  decision instead of re-deriving it from raw row data each render. */
  scenario?: 1 | 2 | 3 | 4
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

export interface Composite {
  separator: string
  /** Canonical field names (one per segment) in left-to-right order. */
  parts: string[]
}

export interface ColumnMapping {
  field: AIFieldName
  confidence: number
  reason: string
  /** Present when the column is a composite (e.g. "78596_UPC6GX..._30101"). */
  composite?: Composite
}

export interface DisplayPriorityFromAI {
  primary: string | null
  secondary: string | null
  third: string | null
  scenario: 1 | 2 | 3 | 4
}

/** Cleaning instruction returned by the AI when it remapped a column and the
 *  row values need post-processing (e.g., strip a trailing " BBC FUJI" suffix). */
export interface ExtractionHint {
  source_column: string
  pattern: string
  extract_as: string
  strip_suffix: boolean
  suffix_pattern: string
  example_input: string
  example_output: string
}

export interface AIMappingResult {
  mappings: Record<string, ColumnMapping>
  display_priority: DisplayPriorityFromAI
  unmapped_columns: string[]
  warnings: string[]
  extraction_hints?: ExtractionHint[]
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
