import type { DisplayFields } from '../types'

/**
 * Reusable display-priority logic shared with FieldFlow.
 *
 * Decides which columns to surface on a card given:
 *   - itemData:      a single row's values keyed by original header
 *   - fieldMappings: header → canonical AI field name (e.g. "TAG NO." → "tag_number")
 *
 * The four scenarios are decided by which IDENTIFIER fields actually have
 * a non-empty value on this row. Description is always considered last.
 *
 *   1. tag_number present                          → tag / item_code / description
 *   2. no tag, item_code present                   → item_code / label / description
 *   3. no tag, no item_code, label_number present  → label / description
 *   4. none of the above                           → description only
 *
 * label_number is "hidden but searchable" in scenario 1 — the search
 * routine in the host app searches all data fields, so we just don't
 * surface it on the card.
 */

const FIRST_PRIORITY: ReadonlyArray<string> = ['tag_number']
const SECOND_PRIORITY: ReadonlyArray<string> = ['item_code', 'ic_number']
const THIRD_PRIORITY: ReadonlyArray<string> = ['label_number']

/** Canonical fields that are NEVER valid as the primary (title) field. A row
 *  whose only candidate maps to one of these gets an empty title, never a
 *  quantity / size / cost as its heading. */
const FORBIDDEN_PRIMARY: ReadonlySet<string> = new Set([
  'quantity', 'unit', 'size', 'cost', 'weight', 'price',
])

const SIZE_FIELDS: ReadonlyArray<string> = ['size', 'dimension', 'dim']

/**
 * A purely numeric value ~5–12 digits long is label-shaped (e.g. Danieli label
 * number "36893", or the "78596" prefix of a composite asset ID) — NOT a
 * dimension. Backends occasionally drop such a value into the size column; when
 * that happens it must be treated as a Label identifier, never rendered as
 * "Size: N".
 *
 * NOTE: the spec said "6–12 digits", but the live-evidence label (36893) and
 * the codebase's own composite example (78596, see types/index.ts) are both
 * 5-digit Danieli labels — a 6-digit floor would miss exactly the values we
 * must fix. Floor lowered to 5; 4-and-under (years, small qtys) stay excluded.
 */
export function isLabelShaped(value: string | null | undefined): boolean {
  if (!value) return false
  return /^\d{5,12}$/.test(value.trim())
}

/**
 * A value is dimension-shaped — and therefore valid for the Size badge — only
 * when it carries a dimension token: an inch/foot mark (" '), a metric unit
 * (mm / cm / m / in / ft), an N×M dimension, or a fraction. A bare number that
 * is not dimension-shaped is suppressed from the Size badge.
 */
export function isDimensionShaped(value: string | null | undefined): boolean {
  if (!value) return false
  const s = value.trim()
  if (!s) return false
  return (
    /["']/.test(s) ||                          // inch / foot marks
    /\b\d+(\.\d+)?\s*(mm|cm|in|inch|inches|ft|feet|foot|m)\b/i.test(s) || // units
    /\d\s*[x×]\s*\d/i.test(s) ||                // 2 x 4 dimensions
    /\d+\s*\/\s*\d+/.test(s) ||                 // ascii fraction 1/2
    /[¼½¾⅓⅔⅛⅜⅝⅞]/.test(s)                       // unicode fractions
  )
}

/** When description is absent, fill the secondary/tertiary slots with the best
 *  available context field in this order. Keeps cards informative on Danieli
 *  shipping manifests where true descriptions don't exist. */
const CONTEXT_FALLBACK: ReadonlyArray<string> = [
  'location', 'vendor', 'category', 'po_number',
]

function findHeader(
  fieldMappings: Record<string, string>,
  candidates: ReadonlyArray<string>,
): string | null {
  for (const candidate of candidates) {
    for (const [header, field] of Object.entries(fieldMappings)) {
      if (field === candidate) return header
    }
  }
  return null
}

function findHeaderWithValue(
  itemData: Record<string, string>,
  fieldMappings: Record<string, string>,
  candidates: ReadonlyArray<string>,
): string | null {
  for (const candidate of candidates) {
    for (const [header, field] of Object.entries(fieldMappings)) {
      if (field === candidate && (itemData[header] ?? '').trim() !== '') {
        return header
      }
    }
  }
  return null
}

function valueOrNull(itemData: Record<string, string>, header: string | null): string | null {
  if (!header) return null
  const v = (itemData[header] ?? '').trim()
  return v === '' ? null : v
}

export function getDisplayPriority(
  itemData: Record<string, string>,
  fieldMappings: Record<string, string>,
): DisplayFields {
  const tagHeader   = findHeaderWithValue(itemData, fieldMappings, FIRST_PRIORITY)
  const codeHeader  = findHeaderWithValue(itemData, fieldMappings, SECOND_PRIORITY)
  const labelHeader = findHeaderWithValue(itemData, fieldMappings, THIRD_PRIORITY)
  const descHeader  = findHeaderWithValue(itemData, fieldMappings, ['description'])
  const sizeHeader  = findHeaderWithValue(itemData, fieldMappings, SIZE_FIELDS)

  const tagVal   = valueOrNull(itemData, tagHeader)
  const codeVal  = valueOrNull(itemData, codeHeader)
  let   labelVal = valueOrNull(itemData, labelHeader)
  const descVal  = valueOrNull(itemData, descHeader)
  const sizeVal  = valueOrNull(itemData, sizeHeader)

  // A label-shaped number sitting in the size column (e.g. "36893") is a
  // mis-mapped Label, not a dimension. Promote it into the label slot so it
  // can serve as a title identifier instead of leaking into "Size: N". Only do
  // so when no genuine label_number value already exists for this row.
  let labelFromSizeHeader: string | null = null
  if (!labelVal && isLabelShaped(sizeVal)) {
    labelVal = sizeVal
    labelFromSizeHeader = sizeHeader
  }

  // Hidden-but-searchable: any identifier we recognised but didn't surface.
  const allIdHeaders = [
    findHeader(fieldMappings, FIRST_PRIORITY),
    findHeader(fieldMappings, SECOND_PRIORITY),
    findHeader(fieldMappings, THIRD_PRIORITY),
  ].filter((h): h is string => h !== null)

  let primary: string | null = null
  let primaryHeader: string | null = null
  let secondary: string | null = null
  let third: string | null = null
  const surfaced = new Set<string>()
  const surface = (h: string | null) => { if (h) surfaced.add(h) }

  // Title identifier chain: tag → item_code → label → description. We never
  // fall through to quantity / unit / size / cost / weight (FORBIDDEN_PRIMARY),
  // and the chain only ever pulls from identifier or description columns.
  if (tagVal) {
    // Scenario 1: tag exists
    primary   = tagVal;   primaryHeader = tagHeader;   surface(tagHeader)
    secondary = codeVal;  surface(codeHeader)
    third     = descVal;  surface(descHeader)
  } else if (codeVal) {
    // Scenario 2: item_code exists, no tag
    primary   = codeVal;  primaryHeader = codeHeader;  surface(codeHeader)
    secondary = labelVal; surface(labelHeader); surface(labelFromSizeHeader)
    third     = descVal;  surface(descHeader)
  } else if (labelVal) {
    // Scenario 3: only label exists (possibly promoted from a mis-mapped size col)
    primary   = labelVal; primaryHeader = labelHeader ?? labelFromSizeHeader; surface(labelHeader); surface(labelFromSizeHeader)
    secondary = descVal;  surface(descHeader)
  } else {
    // Scenario 4: nothing but description (or nothing at all)
    primary = descVal;    primaryHeader = descHeader;  surface(descHeader)
  }

  // Rule 1 safety net: a title must never be a quantity / unit / size / cost /
  // weight value. The chain above can't pick one, but a synthetic or drifted
  // field map could point an identifier slot at such a column — drop it here so
  // the context fallback (or an empty title) takes over. The deliberately
  // promoted size→label value is exempt.
  if (
    primaryHeader &&
    primaryHeader !== labelFromSizeHeader &&
    FORBIDDEN_PRIMARY.has(fieldMappings[primaryHeader] ?? '')
  ) {
    primary = null
  }

  // Context fallback: if description was missing (or any of the ID slots
  // produced nothing), fill remaining slots from best-available context fields.
  // Danieli shipping manifests typically have no real description column, so
  // falling back to location/vendor/category keeps cards useful.
  const slotValues = [primary, secondary, third]
  if (slotValues.some(v => v === null || v === '')) {
    for (const fallbackField of CONTEXT_FALLBACK) {
      const h = findHeaderWithValue(itemData, fieldMappings, [fallbackField])
      if (!h || surfaced.has(h)) continue
      const v = valueOrNull(itemData, h)
      if (!v) continue
      const slotIdx = slotValues.findIndex(x => x === null || x === '')
      if (slotIdx === -1) break
      slotValues[slotIdx] = v
      surfaced.add(h)
    }
    primary = slotValues[0]
    secondary = slotValues[1]
    third = slotValues[2]
  }

  // Compact: if a slot is empty, slide later slots up.
  const filled = [primary, secondary, third].filter((v): v is string => v !== null && v !== '')
  primary   = filled[0] ?? ''
  secondary = filled[1] ?? null
  third     = filled[2] ?? null

  const hiddenSearchable = allIdHeaders.filter(h => !surfaced.has(h))

  return { primary, secondary, third, hiddenSearchable }
}

/**
 * Convenience: which scenario number applies given the mappings + this row.
 * Mirrors the AI's `display_priority.scenario` so callers can reason about it.
 */
export function getScenario(
  itemData: Record<string, string>,
  fieldMappings: Record<string, string>,
): 1 | 2 | 3 | 4 {
  if (findHeaderWithValue(itemData, fieldMappings, FIRST_PRIORITY)) return 1
  if (findHeaderWithValue(itemData, fieldMappings, SECOND_PRIORITY)) return 2
  if (findHeaderWithValue(itemData, fieldMappings, THIRD_PRIORITY)) return 3
  return 4
}
