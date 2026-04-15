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

  // Hidden-but-searchable: any identifier we recognised but didn't surface.
  const allIdHeaders = [
    findHeader(fieldMappings, FIRST_PRIORITY),
    findHeader(fieldMappings, SECOND_PRIORITY),
    findHeader(fieldMappings, THIRD_PRIORITY),
  ].filter((h): h is string => h !== null)

  let primary: string | null = null
  let secondary: string | null = null
  let third: string | null = null
  const surfaced = new Set<string>()

  if (tagHeader) {
    // Scenario 1: tag exists
    primary   = valueOrNull(itemData, tagHeader);   if (tagHeader)   surfaced.add(tagHeader)
    secondary = valueOrNull(itemData, codeHeader);  if (codeHeader)  surfaced.add(codeHeader)
    third     = valueOrNull(itemData, descHeader);  if (descHeader)  surfaced.add(descHeader)
  } else if (codeHeader) {
    // Scenario 2: item_code exists, no tag
    primary   = valueOrNull(itemData, codeHeader);  surfaced.add(codeHeader)
    secondary = valueOrNull(itemData, labelHeader); if (labelHeader) surfaced.add(labelHeader)
    third     = valueOrNull(itemData, descHeader);  if (descHeader)  surfaced.add(descHeader)
  } else if (labelHeader) {
    // Scenario 3: only label exists
    primary   = valueOrNull(itemData, labelHeader); surfaced.add(labelHeader)
    secondary = valueOrNull(itemData, descHeader);  if (descHeader)  surfaced.add(descHeader)
  } else {
    // Scenario 4: nothing but description (or nothing at all)
    primary = valueOrNull(itemData, descHeader)
    if (descHeader) surfaced.add(descHeader)
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
