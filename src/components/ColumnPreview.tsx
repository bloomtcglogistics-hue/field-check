import type { DisplayConfig, AIMappingResult } from '../types'

export type MappingSource = 'ai' | 'auto' | 'manual'

export type RoleKey = 'idName' | 'descName' | 'qtyNames' | 'grpName' | 'ctxNames' | 'unmapped'

export interface RoleOption {
  key: RoleKey
  label: string
}

export const ROLE_OPTIONS: RoleOption[] = [
  { key: 'idName',    label: 'ID' },
  { key: 'descName',  label: 'Description' },
  { key: 'qtyNames',  label: 'Quantity' },
  { key: 'grpName',   label: 'Group By' },
  { key: 'ctxNames',  label: 'Context Tag' },
  { key: 'unmapped',  label: 'Detail (unmapped)' },
]

interface Props {
  headers: string[]
  rows: Record<string, string>[]
  displayConfig: DisplayConfig
  fileName: string
  /** Per-header override the user has set in this preview session. */
  overrides?: Record<string, RoleKey>
  /** Source of the mapping (set when AI succeeded). */
  source: MappingSource
  /** AI mapping payload, if available — used for confidence + per-column badge. */
  aiResult?: AIMappingResult | null
  /** When the user picks a different role for a column. */
  onOverride?: (header: string, role: RoleKey) => void
}

function roleForHeader(config: DisplayConfig, header: string): RoleKey {
  if (header === config.idName) return 'idName'
  if (header === config.descName) return 'descName'
  if (config.qtyNames.includes(header)) return 'qtyNames'
  if (config.grpName === header) return 'grpName'
  if (config.ctxNames.includes(header)) return 'ctxNames'
  return 'unmapped'
}

function roleLabel(role: RoleKey): string {
  return ROLE_OPTIONS.find(r => r.key === role)?.label ?? '—'
}

const ROLE_PRIORITY: RoleKey[] = ['idName', 'descName', 'qtyNames', 'grpName', 'ctxNames', 'unmapped']

export default function ColumnPreview({
  headers,
  rows,
  displayConfig,
  fileName,
  overrides = {},
  source,
  aiResult,
  onOverride,
}: Props) {
  const sample = rows[0] ?? {}

  // Sort headers by current role priority
  const sorted = [...headers].sort((a, b) => {
    const ra = overrides[a] ?? roleForHeader(displayConfig, a)
    const rb = overrides[b] ?? roleForHeader(displayConfig, b)
    return ROLE_PRIORITY.indexOf(ra) - ROLE_PRIORITY.indexOf(rb)
  })

  const dotColor = source === 'ai' ? 'var(--green)' : 'var(--orange)'
  const sourceLabel = source === 'ai'
    ? 'AI-Enhanced Import'
    : source === 'manual'
      ? 'Manual mapping'
      : 'AI-Enhanced Import (offline fallback)'

  return (
    <div className="column-preview">
      <div className="preview-header">
        Detected columns · <span style={{ color: 'var(--text3)', fontWeight: 400 }}>{fileName}</span>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
          {rows.length} rows · {headers.length} columns
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: 'var(--text2)' }}>
          <span
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: dotColor,
              boxShadow: `0 0 6px ${dotColor}`,
            }}
            aria-hidden
          />
          <span>{sourceLabel}</span>
        </div>
      </div>

      <div className="preview-grid">
        {sorted.map(h => {
          const currentRole = overrides[h] ?? roleForHeader(displayConfig, h)
          const aiMapping = aiResult?.mappings?.[h]
          const wasAiMapped = source === 'ai' && !!aiMapping
          const wasOverridden = overrides[h] !== undefined
          const badge: 'AI' | 'Auto' | 'Manual' = wasOverridden
            ? 'Manual'
            : wasAiMapped ? 'AI' : 'Auto'

          const confidencePct = aiMapping ? Math.round(aiMapping.confidence * 100) : null
          const lowConfidence = confidencePct !== null && confidencePct < 70 && badge === 'AI'

          const badgeBg =
            badge === 'AI'     ? 'var(--green-light)' :
            badge === 'Manual' ? 'var(--orange-light)' :
                                 'var(--border-light)'
          const badgeFg =
            badge === 'AI'     ? 'var(--green-dark)' :
            badge === 'Manual' ? 'var(--orange)' :
                                 'var(--text2)'

          return (
            <div
              key={h}
              className="preview-row"
              style={lowConfidence ? {
                background: 'var(--orange-light)',
                borderRadius: 6,
                padding: '6px 8px',
              } : undefined}
            >
              <span className="preview-role">{roleLabel(currentRole)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="preview-col" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h}
                  </span>
                  <span
                    title={aiMapping?.reason ?? (badge === 'Auto' ? 'Fuzzy-matched' : 'Manually overridden')}
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.4px',
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: badgeBg,
                      color: badgeFg,
                      flexShrink: 0,
                    }}
                  >
                    {badge}
                  </span>
                  {confidencePct !== null && badge === 'AI' && (
                    <span
                      style={{
                        fontSize: 11,
                        color: lowConfidence ? 'var(--orange)' : 'var(--text3)',
                        fontWeight: lowConfidence ? 700 : 400,
                        flexShrink: 0,
                      }}
                    >
                      {confidencePct}%
                    </span>
                  )}
                </div>
                {sample[h] && <div className="preview-sample">e.g. "{sample[h]}"</div>}
                {lowConfidence && (
                  <div style={{ fontSize: 11, color: 'var(--orange)', marginTop: 2, fontWeight: 600 }}>
                    Low confidence — please verify
                  </div>
                )}
                {onOverride && (
                  <select
                    value={currentRole}
                    onChange={e => onOverride(h, e.target.value as RoleKey)}
                    style={{
                      marginTop: 4,
                      fontSize: 12,
                      padding: '3px 6px',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      background: 'var(--card-bg)',
                      color: 'var(--text2)',
                    }}
                    aria-label={`Change role for column ${h}`}
                  >
                    {ROLE_OPTIONS.map(opt => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
