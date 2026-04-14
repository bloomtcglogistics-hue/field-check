import { useState, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { useRealtimeStore } from '../stores/realtimeStore'
import { useAppStore } from '../stores/appStore'
import type { Item, DisplayConfig } from '../types'

interface Props {
  item: Item
  displayConfig: DisplayConfig
  searchQuery: string
  onNeedName: () => void
}

/** Wrap all occurrences of `query` in a <mark> span */
function highlight(text: string, query: string): React.ReactNode {
  if (!query || !text) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i}>{part}</mark>
      : part
  )
}

export default function ItemCard({ item, displayConfig, searchQuery, onNeedName }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [noteValue, setNoteValue] = useState<string | null>(null) // null = not yet loaded
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteTimer, setNoteTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  const { checkStates, toggleCheck, updateNote } = useRealtimeStore()
  const { userName } = useAppStore()

  const state = checkStates.get(item.id)
  const isChecked = state?.checked ?? false
  const note = noteValue !== null ? noteValue : (state?.note ?? '')

  const { descName, idName, ctxNames, qtyNames, grpName } = displayConfig

  const handleCheck = useCallback(() => {
    if (!userName) { onNeedName(); return }
    toggleCheck(item.id, item.rfe_id, !isChecked, userName)
  }, [isChecked, userName, item.id, item.rfe_id, toggleCheck, onNeedName])

  const handleNoteChange = (val: string) => {
    setNoteValue(val)
    setNoteSaving(true)
    if (noteTimer) clearTimeout(noteTimer)
    const t = setTimeout(async () => {
      await updateNote(item.id, item.rfe_id, val)
      setNoteSaving(false)
    }, 800)
    setNoteTimer(t)
  }

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!expanded && noteValue === null) {
      setNoteValue(state?.note ?? '')
    }
    setExpanded(x => !x)
  }

  const idVal = item.data[idName] || ''
  const descVal = item.data[descName] || ''
  const hasId = !!idVal && idName !== descName

  // Determine primary display line
  const line1 = hasId ? idVal : descVal
  const line2 = hasId ? descVal : ''

  return (
    <div className={`item-card${isChecked ? ' checked' : ''}`}>
      <div className="item-card-main" onClick={handleCheck}>
        {/* Status dot */}
        <div className={`item-dot ${isChecked ? 'checked' : 'unchecked'}`} />

        {/* Content */}
        <div className="item-content">
          {line1 && (
            <div className="item-id">
              {highlight(line1, searchQuery)}
            </div>
          )}
          {line2 && (
            <div className="item-desc">
              {highlight(line2, searchQuery)}
            </div>
          )}

          {/* Tags row */}
          {(ctxNames.length > 0 || qtyNames.length > 0) && (
            <div className="item-tags">
              {qtyNames.map(q => {
                const v = item.data[q]
                return v ? <span key={q} className="item-tag qty">{q}: {v}</span> : null
              })}
              {ctxNames.slice(0, 3).map(c => {
                const v = item.data[c]
                return v ? <span key={c} className="item-tag">{highlight(v, searchQuery)}</span> : null
              })}
            </div>
          )}
        </div>

        {/* Expand button */}
        <button
          className={`item-expand-btn${expanded ? ' expanded' : ''}`}
          onClick={handleExpand}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          <ChevronDown size={18} />
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="item-detail">
          {/* All columns */}
          {Object.entries(item.data)
            .filter(([k]) => k !== descName && k !== idName)
            .map(([k, v]) => (
              v ? (
                <div key={k} className="detail-row">
                  <span className="detail-key">{k}</span>
                  <span className="detail-val">{highlight(v, searchQuery)}</span>
                </div>
              ) : null
            ))
          }

          {/* Note field */}
          <div className="note-wrap">
            <div className="note-label">Note {noteSaving ? '· saving…' : ''}</div>
            <textarea
              className="note-input"
              placeholder="Add a note…"
              value={note}
              onChange={e => handleNoteChange(e.target.value)}
              rows={2}
            />
          </div>

          {/* Checked-by attribution */}
          {isChecked && state?.checked_by && (
            <div className="checked-by">
              ✓ Verified by {state.checked_by}
              {state.checked_at
                ? ` · ${new Date(state.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
