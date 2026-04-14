/**
 * ConflictBanner — Shows items that were checked by multiple users while offline.
 * Informational only: crew resolves duplicates in person.
 */

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useRealtimeStore } from '../stores/realtimeStore'

export default function ConflictBanner() {
  const { conflicts, clearConflict, clearAllConflicts } = useRealtimeStore()
  const [expanded, setExpanded] = useState(false)

  if (conflicts.length === 0) return null

  return (
    <div className="conflict-banner">
      <div className="conflict-banner-header" onClick={() => setExpanded(x => !x)}>
        <span className="conflict-banner-icon">
          <AlertTriangle size={16} />
        </span>
        <span className="conflict-banner-title">
          {conflicts.length === 1
            ? '1 item was checked by multiple people while offline'
            : `${conflicts.length} items were checked by multiple people while offline`}
        </span>
        <div className="conflict-banner-actions">
          <button
            className="conflict-dismiss-all"
            onClick={e => { e.stopPropagation(); clearAllConflicts() }}
          >
            Dismiss All
          </button>
          <span className="conflict-expand-icon">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="conflict-list">
          {conflicts.map(c => (
            <div key={c.itemId} className="conflict-item">
              <div className="conflict-item-body">
                <div className="conflict-item-desc">{c.itemDescription}</div>
                <div className="conflict-item-detail">
                  {c.localUser} &amp; {c.remoteUser} both checked this item
                </div>
              </div>
              <button
                className="conflict-dismiss"
                onClick={() => clearConflict(c.itemId)}
                aria-label="Dismiss conflict"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
