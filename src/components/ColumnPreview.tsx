import type { DisplayConfig } from '../types'

interface Props {
  headers: string[]
  rows: Record<string, string>[]
  displayConfig: DisplayConfig
  fileName: string
}

// Map a role label to which column(s) it covers
function getRoles(config: DisplayConfig): Record<string, string> {
  const roles: Record<string, string> = {}
  roles[config.descName] = 'Description'
  roles[config.idName] = 'ID'
  if (config.grpName) roles[config.grpName] = 'Group By'
  for (const q of config.qtyNames) roles[q] = 'Quantity'
  for (const c of config.ctxNames) roles[c] = 'Context Tag'
  return roles
}

export default function ColumnPreview({ headers, rows, displayConfig, fileName }: Props) {
  const roles = getRoles(displayConfig)
  const sample = rows[0] ?? {}
  const roleOrder = ['Description', 'ID', 'Quantity', 'Group By', 'Context Tag']

  // Sort headers: assigned first (by role priority), then unassigned
  const assigned = headers.filter(h => roles[h])
  const unassigned = headers.filter(h => !roles[h])
  assigned.sort((a, b) => roleOrder.indexOf(roles[a]) - roleOrder.indexOf(roles[b]))

  return (
    <div className="column-preview">
      <div className="preview-header">
        Detected columns · <span style={{ color: 'var(--text3)', fontWeight: 400 }}>{fileName}</span>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
          {rows.length} rows · {headers.length} columns
        </div>
      </div>

      <div className="preview-grid">
        {/* Assigned columns */}
        {assigned.map(h => (
          <div key={h} className="preview-row">
            <span className="preview-role">{roles[h]}</span>
            <div style={{ flex: 1 }}>
              <div className="preview-col">{h}</div>
              {sample[h] && <div className="preview-sample">e.g. "{sample[h]}"</div>}
            </div>
          </div>
        ))}

        {/* Unassigned columns (shown as extra detail) */}
        {unassigned.length > 0 && (
          <>
            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 8, fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              Additional columns (shown in expanded view)
            </div>
            {unassigned.map(h => (
              <div key={h} className="preview-row">
                <span className="preview-role" style={{ color: 'var(--text3)' }}>Detail</span>
                <div style={{ flex: 1 }}>
                  <div className="preview-col" style={{ color: 'var(--text2)' }}>{h}</div>
                  {sample[h] && <div className="preview-sample">e.g. "{sample[h]}"</div>}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
