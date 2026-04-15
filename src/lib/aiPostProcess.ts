import type { AIMappingResult, ColumnMapping, ExtractionHint } from '../types'

const RAW_SUFFIX = '__raw'
const PART_SEPARATOR = '__part__'

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
  const { mappings: cleanedMappings, conflicts } = dedupeMappingsByConfidence(ai.mappings)
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
