/**
 * Derive a PDF report title from the user's free-text description entered at
 * import time. Keyword-based — first category to match wins. Order matters.
 */
export type ReportType =
  | 'MATERIALS VERIFICATION REPORT'
  | 'EQUIPMENT VERIFICATION REPORT'
  | 'TOOLS VERIFICATION REPORT'
  | 'ELECTRICAL VERIFICATION REPORT'
  | 'FIELD VERIFICATION REPORT'

const RULES: Array<{ type: ReportType; keywords: string[] }> = [
  {
    type: 'ELECTRICAL VERIFICATION REPORT',
    keywords: ['cable', 'electrical', 'wire'],
  },
  {
    type: 'MATERIALS VERIFICATION REPORT',
    keywords: ['material', 'piping', 'fitting', 'valve', 'bolt'],
  },
  {
    type: 'EQUIPMENT VERIFICATION REPORT',
    keywords: ['equipment', 'crane', 'lift', 'scaffold'],
  },
  {
    type: 'TOOLS VERIFICATION REPORT',
    keywords: ['tool', 'consumable'],
  },
]

export function detectReportType(description: string | null | undefined): ReportType {
  const s = (description ?? '').toLowerCase()
  if (!s.trim()) return 'FIELD VERIFICATION REPORT'
  for (const rule of RULES) {
    if (rule.keywords.some(k => s.includes(k))) return rule.type
  }
  return 'FIELD VERIFICATION REPORT'
}
