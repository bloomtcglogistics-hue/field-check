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
 *   4. none of the above                           → description only (or placeholder)
 *
 * label_number is "hidden but searchable" in scenario 1 — the search
 * routine in the host app searches all data fields, so we just don't
 * surface it on the card.
 *
 * HARD RULE (enforced below, no exceptions): the canonical fields
 * `quantity`, `unit`, `size`, `cost`, `weight` can NEVER occupy the
 * primary (or secondary / tertiary) slot. If nothing valid resolves,
 * we fall back to description, then to PLACEHOLDER_TITLE. A quantity
 * number rendered as a card title is a bug, not a reasonable default.
 */

const FIRST_PRIORITY: ReadonlyArray<string> = ['tag_number']
const SECOND_PRIORITY: ReadonlyArray<string> = ['item_code', 'ic_number']
const THIRD_PRIORITY: ReadonlyArray<string> = ['label_number']

/** Canonical fields that are NEVER allowed to fill a display slot.
 *  A quantity, unit, size, cost, or weight value rendered as a title
 *  or subtitle is always a bug — those belong in dedicated badges. */
export const FORBIDDEN_DISPLAY_FIELDS: ReadonlySet<string> = new Set([
  'quantity', 'unit', 'size', 'cost', 'weight',
])

/** Shown when no identifier AND no description is present. Callers should
 *  render this with distinct (muted / italic) styling so it reads as an
 *  intentional placeholder rather than real data. */
export const PLACEHOLDER_TITLE = '(no identifier)'

/** When description is absent, fill the secondary/tertiary slots with the best
 *  available context field in this order. Keeps cards informative on Danieli
 *  shipping manifests where true descriptions don't exist. */
const CONTEXT_FALLBACK: ReadonlyArray<string> = [
  'location', 'vendor', 'category', 'po_number',
]

export interface DisplayPriorityOptions {
  /** Headers that must never surface as primary/secondary/third even if the
   *  fieldMappings claim they are an identifier. Used by callers to blacklist
   *  quantity/size columns when the AI mapping is stale or was synthesised
   *  from a DisplayConfig where `idName` accidentally points at a qty column. */
  forbiddenHeaders?: ReadonlyArray<string>
  /** When the AI import returned a definitive scenario for this RFE, pass it
   *  through. If `aiScenario === 4` we skip identifier lookups entirely and go
   *  straight to description / placeholder — honoring the backend's decision
   *  instead of re-deriving from raw row data. */
  aiScenario?: 1 | 2 | 3 | 4
}

/** Strip forbidden canonical fields out of the mappings so downstream lookups
 *  cannot accidentally treat a quantity column as an identifier. Also strips
 *  any header listed in `forbiddenHeaders`. */
function sanitiseMappings(
  fieldMappings: Record<string, string>,
  forbiddenHeaders: ReadonlyArray<string>,
): Record<string, string> {
  const forbiddenHeaderSet = new Set(forbiddenHeaders)
  const out: Record<string, string> = {}
  for (const [header, field] of Object.entries(fieldMappings)) {
    if (forbiddenHeaderSet.has(header)) continue
    if (FORBIDDEN_DISPLAY_FIELDS.has(field)) continue
    out[header] = field
  }
  return out
}

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

/** Defensive check — returns true iff `value` equals the trimmed value of any
 *  header on this row whose canonical field is forbidden. Used to guard
 *  against the quantity-as-title bug even when mappings lie about what a
 *  column is. */
function valueBelongsToForbiddenColumn(
  value: string,
  itemData: Record<string, string>,
  rawMappings: Record<string, string>,
): boolean {
  for (const [header, field] of Object.entries(rawMappings)) {
    if (!FORBIDDEN_DISPLAY_FIELDS.has(field)) continue
    if ((itemData[header] ?? '').trim() === value) return true
  }
  return false
}

export function getDisplayPriority(
  itemData: Record<string, string>,
  fieldMappings: Record<string, string>,
  options: DisplayPriorityOptions = {},
): DisplayFields {
  const { forbiddenHeaders = [], aiScenario } = options
  const rawMappings = fieldMappings
  const safeMappings = sanitiseMappings(fieldMappings, forbiddenHeaders)

  const descHeader = findHeaderWithValue(itemData, safeMappings, ['description'])

  // Honor backend-declared Scenario 4: description only (or placeholder).
  // When the importer already decided there is no identifier for this RFE,
  // do not re-derive a primary from raw row data.
  if (aiScenario === 4) {
    const descVal = valueOrNull(itemData, descHeader)
    const primary = descVal ?? PLACEHOLDER_TITLE
    return {
      primary,
      secondary: null,
      third: null,
      hiddenSearchable: [],
    }
  }

  const tagHeader   = findHeaderWithValue(itemData, safeMappings, FIRST_PRIORITY)
  const codeHeader  = findHeaderWithValue(itemData, safeMappings, SECOND_PRIORITY)
  const labelHeader = findHeaderWithValue(itemData, safeMappings, THIRD_PRIORITY)

  // Hidden-but-searchable: any identifier we recognised but didn't surface.
  const allIdHeaders = [
    findHeader(safeMappings, FIRST_PRIORITY),
    findHeader(safeMappings, SECOND_PRIORITY),
    findHeader(safeMappings, THIRD_PRIORITY),
  ].filter((h): h is string => h !== null)

  let primary: string | null = null
  let secondary: string | null = null
  let third: string | null = null
  const surfaced = new Set<string>()

  if (tagHeader) {
    // Scenario 1: tag exists
    primary   = valueOrNull(itemData, tagHeader);   surfaced.add(tagHeader)
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
      const h = findHeaderWithValue(itemData, safeMappings, [fallbackField])
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

  // Hard guard: under no code path may a forbidden-field value reach a slot.
  // If sanitiseMappings missed something (e.g., an unmapped raw header whose
  // value happens to equal a qty column's value), drop it and fall through.
  if (primary && valueBelongsToForbiddenColumn(primary, itemData, rawMappings)) {
    // Deliberate console.error — this indicates a caller wiring bug that
    // should surface during QA, not a silent swallow.
    console.error(
      '[displayPriority] refused quantity/size/cost/weight/unit as primary title',
      { primary, fieldMappings: rawMappings },
    )
    primary = ''
    // Try to recover: demote secondary/third up, else placeholder.
    const recovered = [secondary, third].filter((v): v is string => !!v &&
      !valueBelongsToForbiddenColumn(v, itemData, rawMappings))
    primary = recovered[0] ?? PLACEHOLDER_TITLE
    secondary = recovered[1] ?? null
    third = null
  }

  if (secondary && valueBelongsToForbiddenColumn(secondary, itemData, rawMappings)) {
    secondary = null
  }
  if (third && valueBelongsToForbiddenColumn(third, itemData, rawMappings)) {
    third = null
  }

  // Last resort: if everything dropped out, show the placeholder rather than
  // an empty title. Never leave the card titled with a blank string.
  if (!primary) primary = PLACEHOLDER_TITLE

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
  const safe = sanitiseMappings(fieldMappings, [])
  if (findHeaderWithValue(itemData, safe, FIRST_PRIORITY)) return 1
  if (findHeaderWithValue(itemData, safe, SECOND_PRIORITY)) return 2
  if (findHeaderWithValue(itemData, safe, THIRD_PRIORITY)) return 3
  return 4
}

// ── Self-assertions (run once at module load) ──────────────────────────────
// Cheap sanity checks that the hard rules still hold. These run in all builds
// (dev and prod). If any fail, the app console will scream — that's the whole
// point. Cost: ~4 function calls once per page load.
;(function assertInvariants() {
  try {
    // Rule: quantity can never be primary, even if the mapping lies.
    const result1 = getDisplayPriority(
      { QTY: '5', DESC: 'Widget' },
      { QTY: 'tag_number', DESC: 'description' },
    )
    if (result1.primary === '5') {
      console.error('[displayPriority] invariant violated: qty surfaced as primary', result1)
    }

    // Rule: scenario 4 with no description returns the placeholder, not ''.
    const result2 = getDisplayPriority(
      { QTY: '5' },
      { QTY: 'quantity' },
      { aiScenario: 4 },
    )
    if (result2.primary !== PLACEHOLDER_TITLE) {
      console.error('[displayPriority] invariant violated: scenario 4 did not placeholder', result2)
    }

    // Rule: every forbidden field is excluded from mapping sanitisation.
    const sanitised = sanitiseMappings(
      { A: 'quantity', B: 'unit', C: 'size', D: 'cost', E: 'weight', F: 'tag_number' },
      [],
    )
    if (Object.keys(sanitised).length !== 1 || sanitised.F !== 'tag_number') {
      console.error('[displayPriority] invariant violated: forbidden fields not stripped', sanitised)
    }
  } catch (e) {
    console.error('[displayPriority] invariant self-test threw', e)
  }
})()
