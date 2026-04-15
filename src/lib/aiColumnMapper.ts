import type { AIMappingResult } from '../types'

const ENDPOINT = 'https://web-production-69f23.up.railway.app/parse-import'
const TIMEOUT_MS = 15_000

/**
 * Calls the backend AI to intelligently map column headers.
 *
 * Never throws — returns null on any failure (network, timeout, 4xx, 5xx,
 * malformed payload). Callers fall back to fuzzy matching in that case.
 */
export async function aiMapColumns(
  headers: string[],
  sampleRows: string[][],
  fileName: string,
): Promise<AIMappingResult | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        headers,
        sample_rows: sampleRows,
        file_name: fileName,
      }),
      signal: ctrl.signal,
    })

    if (!res.ok) {
      console.warn('[aiMapColumns] Backend returned non-OK status:', res.status)
      return null
    }

    const json = (await res.json()) as Partial<AIMappingResult>

    if (!json || typeof json !== 'object' || !json.mappings || typeof json.mappings !== 'object') {
      console.warn('[aiMapColumns] Malformed response — missing mappings')
      return null
    }

    return {
      mappings: json.mappings,
      display_priority: json.display_priority ?? { primary: null, secondary: null, third: null, scenario: 4 },
      unmapped_columns: json.unmapped_columns ?? [],
      warnings: json.warnings ?? [],
      extraction_hints: Array.isArray(json.extraction_hints) ? json.extraction_hints : [],
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      console.warn('[aiMapColumns] Timed out after', TIMEOUT_MS, 'ms')
    } else {
      console.warn('[aiMapColumns] Request failed:', err)
    }
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Pull a representative sample of rows for the AI to inspect. */
export function buildSampleRows(
  headers: string[],
  rows: Record<string, string>[],
  count = 5,
): string[][] {
  return rows.slice(0, count).map(r => headers.map(h => r[h] ?? ''))
}
