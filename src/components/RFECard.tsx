import { ChevronRight, AlertTriangle, Lock, FileEdit } from 'lucide-react'
import type { RFEIndex, RFEStatus } from '../types'

interface Props {
  rfe: RFEIndex
  checkedCount: number
  onSelect: () => void
  hasConflicts?: boolean
  conflictCount?: number
}

function statusMeta(status: RFEStatus | undefined): {
  label: string
  className: string
  icon?: React.ReactNode
} | null {
  switch (status) {
    case 'finalized':
      return { label: 'FINALIZED', className: 'finalized', icon: <Lock size={10} aria-hidden="true" /> }
    case 'draft':
      return { label: 'DRAFT', className: 'draft', icon: <FileEdit size={10} aria-hidden="true" /> }
    case 'active':
      return null // active is the default — no badge needed
    default:
      return null
  }
}

export default function RFECard({
  rfe, checkedCount, onSelect,
  hasConflicts = false, conflictCount = 0,
}: Props) {
  const total = rfe.count
  const pct = total > 0 ? Math.round((checkedCount / total) * 100) : 0

  let badge = 'incomplete'
  let badgeLabel = 'NOT STARTED'
  if (pct === 100) { badge = 'complete'; badgeLabel = 'COMPLETE' }
  else if (checkedCount > 0) { badge = 'partial'; badgeLabel = 'PARTIAL' }

  const statusBadge = statusMeta(rfe.status)
  const cardStatusClass = rfe.status === 'finalized'
    ? ' status-finalized'
    : rfe.status === 'draft'
      ? ' status-draft'
      : ''

  const date = new Date(rfe.imported_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div
      className={`rfe-card${hasConflicts ? ' conflict' : ''}${cardStatusClass}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      aria-label={`Open ${rfe.name}${rfe.status ? ` — ${rfe.status}` : ''}`}
    >
      <div className="rfe-card-body">
        <div className="rfe-card-top">
          <div className="rfe-name">{rfe.name}</div>
          <div className="rfe-badge-group">
            {hasConflicts && (
              <span
                className="rfe-badge conflict"
                title="Unresolved offline conflicts"
                role="status"
                aria-label={`${conflictCount} ${conflictCount === 1 ? 'conflict' : 'conflicts'} — multiple users checked while offline`}
              >
                <AlertTriangle size={11} aria-hidden="true" />
                {conflictCount} {conflictCount === 1 ? 'CONFLICT' : 'CONFLICTS'}
              </span>
            )}
            {statusBadge && (
              <span
                className={`rfe-status-badge ${statusBadge.className}`}
                role="status"
                aria-label={`Lifecycle status: ${statusBadge.label.toLowerCase()}`}
              >
                {statusBadge.icon}
                {statusBadge.label}
              </span>
            )}
            <span
              className={`rfe-badge ${badge}`}
              role="status"
              aria-label={`Status: ${badgeLabel.toLowerCase()} — ${checkedCount} of ${total} verified (${pct}%)`}
            >
              {badgeLabel}
            </span>
          </div>
        </div>
        {rfe.reference_id && (
          <div style={{ marginTop: 6 }}>
            <span
              className="rfe-ref-pill"
              title="Reference ID"
              aria-label={`Reference ID ${rfe.reference_id}`}
            >
              Ref: {rfe.reference_id}
            </span>
          </div>
        )}
        <div className="rfe-meta">
          <span className="rfe-meta-main">{total} items · {date}</span>
          <span className="rfe-meta-file">{rfe.file_name}</span>
        </div>
        <div className="rfe-progress" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{checkedCount} / {total} verified</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>{pct}%</span>
          </div>
          <div className="progress-track" style={{ height: 4 }}>
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="rfe-card-hint">
          <span>Tap to view details</span>
          <ChevronRight size={14} aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
