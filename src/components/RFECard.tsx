import { Trash2, RefreshCw, ChevronRight } from 'lucide-react'
import type { RFEIndex } from '../types'

interface Props {
  rfe: RFEIndex
  checkedCount: number
  onSelect: () => void
  onDelete: () => void
  onReset: () => void
}

export default function RFECard({ rfe, checkedCount, onSelect, onDelete, onReset }: Props) {
  const total = rfe.count
  const pct = total > 0 ? Math.round((checkedCount / total) * 100) : 0

  let badge = 'incomplete'
  let badgeLabel = 'Incomplete'
  if (pct === 100) { badge = 'complete'; badgeLabel = 'Complete' }
  else if (checkedCount > 0) { badge = 'partial'; badgeLabel = 'Partial' }

  const date = new Date(rfe.imported_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.confirm(`Delete "${rfe.name}"? This cannot be undone.`)) onDelete()
  }

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.confirm(`Reset all checks for "${rfe.name}"?`)) onReset()
  }

  return (
    <div className="rfe-card">
      <div className="rfe-card-body" onClick={onSelect}>
        <div className="rfe-card-top">
          <div className="rfe-name">{rfe.name}</div>
          <span className={`rfe-badge ${badge}`}>{badgeLabel}</span>
        </div>
        <div className="rfe-meta">
          {total} items · {date} · {rfe.file_name}
        </div>
        <div className="rfe-progress" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{checkedCount} / {total} verified</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>{pct}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="rfe-card-actions">
        <button className="rfe-action-btn reset" onClick={handleReset}>
          <RefreshCw size={14} /> Reset Checks
        </button>
        <button className="rfe-action-btn danger" onClick={handleDelete}>
          <Trash2 size={14} /> Delete
        </button>
        <button
          className="rfe-action-btn"
          onClick={onSelect}
          style={{ color: 'var(--green)', fontWeight: 700 }}
        >
          Open <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
