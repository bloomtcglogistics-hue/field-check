import type { AIMappingResult, ColumnMapping, ExtractionHint } from '../types'

const RAW_SUFFIX = '__raw'
const PART_SEPARATOR = '__part__'

/** Header tokens that unambiguously identify a "description" column. Matched
 *  as whole words against a normalised header so "Cat Class Description",
 *  "Item Desc", "Material Descr" all qualify — but "Descriptor Code" does not
 *  (since "descriptor" is the whole word, not "description"). */
const DESC_HEADER_RE = /(^|\s)(description|desc|descr)(\s|$)/

/** AI fields that we're willing to OVERWRITE when a column's header plainly
 *  reads as a description. These are all "group_by family" fields — the ones
 *  the backend tends to pick when description values happen to repeat across
 *  rows (e.g. forklift model names). A column actually mapped to tag_number,
 *  item_code, serial_number, etc. is left alone. */
const GROUP_FIELDS = new Set(['category', 'type', 'class', 'group_by'])

function looksLikeDescriptionHeader(header: string): boolean {
  const n = header.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  return DESC_HEADER_RE.test(` ${n} `)
}

/**
 * Header-wins rule: if a column's header plainly reads as a description
 * ("Cat Class Description", "Item Desc", etc.) but the AI mapped it to a
 * group_by field (category / type / class), force it back to `description`.
 *
 * Only fires when NO other column is already mapped to description — if the
 * AI correctly identified a real Description column, we leave this one alone
 * and let dedupe pick the real one. This is specifically for the failure
 * mode where the backend over-groups: every row's value is a short
 * category-like string, so it picks `type` despite the header literally
 * saying "Description".
 */
export function forceDescriptionByHeader(
  mappings: Record<string, ColumnMapping>,
): { mappings: Record<string, ColumnMapping>; remapped: string[] } {
  const result: Record<string, ColumnMapping> = { ...mappings }
  const remapped: string[] = []
  let hasDescription = Object.values(result).some(m => m?.field === 'description')

  for (const [header, mapping] of Object.entries(result)) {
    if (!mapping) continue
    if (mapping.field === 'description') continue
    if (!looksLikeDescriptionHeader(header)) continue
    if (!GROUP_FIELDS.has(mapping.field)) continue
    if (hasDescription) continue

    const prevField = mapping.field
    result[header] = {
      ...mapping,
      field: 'description',
      confidence: Math.max(Number(mapping.confidence) || 0, 0.95),
      reason: `Header contains "description" → forced to Description (AI had chosen ${prevField})`,
    }
    remapped.push(header)
    hasDescription = true
  }

  return { mappings: result, remapped }
}

/** Key where the original (uncleaned) value is preserved on a row. */
export function rawKey(header: string): string {
  return `${header}${RAW_SUFFIX}`
}

/** Key where an extracted composite part is stored on a row. */
export function partKey(header: string, partField: string): string {
  return `${header}${PART_SEPARATOR}${partField}`
}

/**
 * Apply AI extraction hints to every row. For each hint with `strip_suffix: true`,
 * strip the `suffix_pattern` from the end of the value in `source_column`.
 *
 * Mutates the cleaned cell in-place and preserves the original value under
 * `<source_column>__raw` for debugging.
 *
 * Returns the number of cells actually modified.
 */
export function applyExtractionHints(
  rows: Record<string, string>[],
  hints: ExtractionHint[] | undefined,
): number {
  if (!hints || hints.length === 0) return 0
  let touched = 0

  for (const hint of hints) {
    if (!hint.strip_suffix || !hint.suffix_pattern) continue
    const col = hint.source_column
    const suffix = hint.suffix_pattern
    for (const row of rows) {
      const val = row[col]
      if (typeof val !== 'string' || val === '') continue
      if (!val.endsWith(suffix)) continue
      // Preserve original, store cleaned
      row[rawKey(col)] = val
      row[col] = val.slice(0, val.length - suffix.length).trimEnd()
      touched++
    }
  }

  return touched
}

/**
 * For every column mapped as composite, split the value using the declared
 * separator and materialise each part as a synthetic field
 * `<header>__part__<canonical_field>` on every row. This keeps the original
 * composite string intact (the full ID is still searchable) while making
 * meaningful segments (e.g. equipment_code) available for display/search.
 *
 * Returns the list of part-field keys created (deduped).
 */
export function splitCompositeFields(
  rows: Record<string, string>[],
  mappings: Record<string, ColumnMapping>,
): string[] {
  const keys = new Set<string>()

  for (const [header, mapping] of Object.entries(mappings)) {
    const composite = mapping.composite
    if (!composite || !composite.parts?.length) continue
    const sep = composite.separator || '_'
    const parts = composite.parts

    for (const row of rows) {
      const val = row[header]
      if (typeof val !== 'string' || val === '') continue
      const segments = val.split(sep)
      // Zip by index — if segments and parts have different lengths, fill what we can
      const n = Math.min(segments.length, parts.length)
      for (let i = 0; i < n; i++) {
        const field = parts[i]
        if (!field) continue
        const seg = segments[i].trim()
        if (!seg) continue
        const k = partKey(header, field)
        row[k] = seg
        keys.add(k)
      }
    }
  }

  return Array.from(keys)
}

/** Result of `dedupeMappingsByConfidence`. */
export interface MappingDedupeResult {
  /** Cleaned mappings with only the winner per canonical field. */
  mappings: Record<string, ColumnMapping>
  /** Conflicts removed (one entry per canonical field that had ≥2 claimants). */
  conflicts: Array<{
    field: string
    winner: { header: string; confidence: number }
    losers: Array<{ header: string; confidence: number }>
  }>
}

/**
 * When multiple columns map to the same canonical field, keep only the highest-
 * confidence claimant; drop the others from the mapping. Returned conflicts can
 * be surfaced to the user as a toast.
 */
export function dedupeMappingsByConfidence(
  mappings: Record<string, ColumnMapping>,
): MappingDedupeResult {
  // Group headers by canonical field
  const byField = new Map<string, Array<{ header: string; confidence: number }>>()
  for (const [header, mapping] of Object.entries(mappings)) {
    const field = mapping?.field
    if (!field) continue
    const list = byField.get(field) ?? []
    list.push({ header, confidence: Number(mapping.confidence) || 0 })
    byField.set(field, list)
  }

  const keep = new Set<string>()
  const conflicts: MappingDedupeResult['conflicts'] = []

  for (const [field, claimants] of byField.entries()) {
    if (claimants.length === 1) {
      keep.add(claimants[0].header)
      continue
    }
    // Sort desc by confidence, break ties by original order (stable)
    claimants.sort((a, b) => b.confidence - a.confidence)
    const [winner, ...losers] = claimants
    keep.add(winner.header)
    conflicts.push({ field, winner, losers })
  }

  const cleaned: Record<string, ColumnMapping> = {}
  for (const [header, mapping] of Object.entries(mappings)) {
    if (keep.has(header)) cleaned[header] = mapping
  }

  return { mappings: cleaned, conflicts }
}

/** Human-readable message for a single conflict (for a toast). */
export function conflictMessage(c: MappingDedupeResult['conflicts'][number]): string {
  const loserNames = c.losers.map(l => `'${l.header}'`).join(', ')
  const fieldLabel = c.field.replace(/_/g, ' ')
  const plural = c.losers.length > 1 ? 'were' : 'was'
  return `'${c.winner.header}' and ${loserNames} both detected as ${fieldLabel} — using '${c.winner.header}' (higher confidence). ${plural === 'were' ? 'Others' : 'Other'} will not be mapped.`
}

/**
 * Single-shot helper: apply all AI post-processing to rows and mappings.
 * Returns the cleaned data plus user-facing notices.
 */
export function applyAIPostProcessing(
  rows: Record<string, string>[],
  ai: AIMappingResult,
): {
  cleanedMappings: Record<string, ColumnMapping>
  compositePartKeys: string[]
  hintsApplied: number
  conflicts: MappingDedupeResult['conflicts']
  notices: string[]
} {
  // Step 1 — header-wins remap (e.g. "Cat Class Description" mis-mapped to
  // `type` gets flipped back to `description` before dedupe sees it). This is
  // a silent auto-correction: the user can still override via the role
  // dropdown if it's wrong, but raising a banner makes a successful fix look
  // like a problem. DEV log only.
  const { mappings: forced, remapped } = forceDescriptionByHeader(ai.mappings)
  if (import.meta.env.DEV && remapped.length > 0) {
    console.log('[aiPostProcess] Header-forced to Description:', remapped)
  }

  // Step 2 — resolve duplicate field claims by confidence.
  const { mappings: cleanedMappings, conflicts } = dedupeMappingsByConfidence(forced)

  const hintsApplied = applyExtractionHints(rows, ai.extraction_hints)
  const compositePartKeys = splitCompositeFields(rows, cleanedMappings)

  const notices: string[] = []
  for (const c of conflicts) notices.push(conflictMessage(c))
  if (hintsApplied > 0) {
    const hintCols = (ai.extraction_hints ?? []).map(h => `'${h.source_column}'`).join(', ')
    notices.push(`Cleaned ${hintsApplied} value(s) in ${hintCols} using AI extraction rules.`)
  }

  return { cleanedMappings, compositePartKeys, hintsApplied, conflicts, notices }
}
