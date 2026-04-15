import { useState, useCallback, useRef } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { useRealtimeStore } from '../stores/realtimeStore'
import { useAppStore } from '../stores/appStore'
import { getDisplayPriority } from '../lib/displayPriority'
import type { Item, DisplayConfig } from '../types'

interface Props {
  item: Item
  displayConfig: DisplayConfig
  searchQuery: string
  onNeedName: () => void
  hasPendingMutation?: boolean
  hasConflict?: boolean
}

/** Gold fuzzy highlight — wraps matching characters individually */
function highlight(text: string, query: string): React.ReactNode {
  if (!query || !text) return text
  const lText = text.toLowerCase()
  const lQuery = query.toLowerCase().trim()
  if (!lQuery) return text

  // Try substring match first (most common)
  const idx = lText.indexOf(lQuery)
  if (idx !== -1) {
    return (
      <>
        {text.slice(0, idx)}
        <mark>{text.slice(idx, idx + lQuery.length)}</mark>
        {text.slice(idx + lQuery.length)}
      </>
    )
  }

  // Fuzzy character-by-character sequence match
  const chars = lQuery.split('')
  let qi = 0
  const nodes: React.ReactNode[] = []
  let buf = ''
  for (let i = 0; i < text.length && qi < chars.length; i++) {
    if (text[i].toLowerCase() === chars[qi]) {
      if (buf) { nodes.push(buf); buf = '' }
      nodes.push(<mark key={i}>{text[i]}</mark>)
      qi++
    } else {
      buf += text[i]
    }
  }
  // If we didn't match all chars, just return plain text
  if (qi < chars.length) return text
  // Append any remaining plain text after the last match
  // We need to append the rest of the string
  const lastMatchPos = (() => {
    let q2 = 0
    let last = 0
    for (let i = 0; i < text.length && q2 < chars.length; i++) {
      if (text[i].toLowerCase() === chars[q2]) { last = i; q2++ }
    }
    return last
  })()
  const tail = text.slice(lastMatchPos + 1)
  if (tail) nodes.push(tail)
  if (buf) nodes.push(buf)
  return <>{nodes}</>
}

// Known "named" context fields shown in compact grid
const GRID_FIELDS = ['make', 'manufacturer', 'mfr', 'mfg', 'model', 'model number', 'model no',
  'serial', 'serial number', 'serial no', 'sn', 'year', 'model year', 'yr', 'status', 'condition']

function isGridField(header: string): boolean {
  const n = header.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  return GRID_FIELDS.some(g => n === g || n.includes(g))
}

export default function ItemCard({ item, displayConfig, searchQuery, onNeedName, hasPendingMutation = false, hasConflict = false }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [noteValue, setNoteValue] = useState<string | null>(null)
  const [noteSaving, setNoteSaving] = useState(false)
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [qtyValue, setQtyValue] = useState<string>('')
  const qtyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { checkStates, toggleCheck, updateNote, updateQtyFound } = useRealtimeStore()
  const { userName } = useAppStore()

  const state = checkStates.get(item.id)
  const isChecked = state?.checked ?? false
  const note = noteValue !== null ? noteValue : (state?.note ?? '')

  const { descName, idName, ctxNames, qtyNames } = displayConfig

  // Build a synthetic AI-field mapping from the persisted DisplayConfig so
  // the shared displayPriority utility can decide primary/secondary/third.
  // We treat the chosen ID column as `tag_number` (highest-priority identifier)
  // — this matches the historical behavior of "ID first, description second".
  const fieldMappings: Record<string, string> = {}
  if (idName && idName !== descName) fieldMappings[idName] = 'tag_number'
  if (descName) fieldMappings[descName] = 'description'

  const display = getDisplayPriority(item.data, fieldMappings)
  const primaryTitle = display.primary
  const subtitle = display.secondary ?? ''
  const tertiary = display.third ?? ''

  // Qty column — show qty_found input if qty > 1
  const qtyColName = qtyNames[0] ?? null
  const qtyNum = qtyColName ? parseInt(item.data[qtyColName] ?? '0', 10) : 0
  const showQtyInput = qtyNum > 1
  const storedQtyFound = state?.qty_found ?? null

  // Grid fields (Make, Model, Serial, Year, Status) from ctxNames
  const gridFields = ctxNames.filter(c => isGridField(c))
  const extraFields = Object.keys(item.data).filter(k => {
    if (k === idName || k === descName) return false
    if (qtyNames.includes(k)) return false
    if (gridFields.includes(k)) return false
    return true
  })

  const handleCheck = useCallback(() => {
    if (!userName) { onNeedName(); return }
    toggleCheck(item.id, item.rfe_id, !isChecked, userName)
  }, [isChecked, userName, item.id, item.rfe_id, toggleCheck, onNeedName])

  const handleNoteChange = (val: string) => {
    setNoteValue(val)
    setNoteSaving(true)
    if (noteTimer.current) clearTimeout(noteTimer.current)
    noteTimer.current = setTimeout(async () => {
      await updateNote(item.id, item.rfe_id, val)
      setNoteSaving(false)
    }, 800)
  }

  const handleQtyChange = (val: string) => {
    setQtyValue(val)
    if (qtyTimer.current) clearTimeout(qtyTimer.current)
    qtyTimer.current = setTimeout(() => {
      const n = val === '' ? null : parseInt(val, 10)
      updateQtyFound(item.id, item.rfe_id, isNaN(n as number) ? null : n)
    }, 600)
  }

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!expanded && noteValue === null) {
      setNoteValue(state?.note ?? '')
    }
    if (!expanded && storedQtyFound !== null) {
      setQtyValue(String(storedQtyFound))
    }
    setExpanded(x => !x)
  }

  const checkedAt = state?.checked_at
    ? new Date(state.checked_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className={`item-card${isChecked ? ' checked' : ''}${hasConflict ? ' conflict' : ''}`}>
      {hasConflict && (
        <div className="item-conflict-badge" title="Checked by multiple users while offline">
          <AlertTriangle size={12} />
          <span>CONFLICT</span>
        </div>
      )}
      <div className="item-card-main">
        {/* Checkbox + optional pending dot */}
        <div className="item-checkbox-wrap">
          <button
            className={`item-checkbox${isChecked ? ' checked' : ''}`}
            onClick={handleCheck}
            aria-label={isChecked ? 'Uncheck item' : 'Check item'}
          >
            {isChecked && (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2.5 7L5.5 10L11.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          {hasPendingMutation && <span className="pending-dot" title="Pending sync" />}
        </div>

        {/* Content */}
        <div className="item-content" onClick={handleCheck}>
          {primaryTitle && (
            <div className="item-primary" style={{ fontSize: 14, fontWeight: 700 }}>
              {highlight(primaryTitle, searchQuery)}
            </div>
          )}
          {subtitle && (
            <div className="item-subtitle" style={{ fontSize: 12, fontWeight: 400 }}>
              {highlight(subtitle, searchQuery)}
            </div>
          )}
          {tertiary && (
            <div className="item-tertiary" style={{ fontSize: 12, color: 'var(--text3)' }}>
              {highlight(tertiary, searchQuery)}
            </div>
          )}

          {/* Compact grid: Make / Model / Serial / Year / Status */}
          {gridFields.length > 0 && (
            <div className="item-grid">
              {gridFields.map(f => {
                const v = item.data[f]
                if (!v) return null
                return (
                  <span key={f} className="item-grid-cell">
                    <span className="item-grid-label">{f}</span>
                    <span className="item-grid-val">{highlight(v, searchQuery)}</span>
                  </span>
                )
              })}
            </div>
          )}

          {/* Qty tags */}
          {qtyNames.map(q => {
            const v = item.data[q]
            return v ? (
              <span key={q} className="item-tag qty" style={{ marginTop: 4, display: 'inline-block' }}>
                {q}: {v}
              </span>
            ) : null
          })}

          {/* Checked timestamp */}
          {isChecked && checkedAt && (
            <div className="item-ts">
              {state?.checked_by ? `${state.checked_by} · ` : ''}{checkedAt}
            </div>
          )}
        </div>

        {/* Expand button */}
        <button
          className="item-expand-btn"
          onClick={handleExpand}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="item-detail">
          {/* Extra / unmapped columns */}
          {extraFields.length > 0 && (
            <>
              <div className="detail-section-title">Details</div>
              {extraFields.map(k => {
                const v = item.data[k]
                if (!v) return null
                return (
                  <div key={k} className="detail-row">
                    <span className="detail-key">{k}</span>
                    <span className="detail-val">{highlight(v, searchQuery)}</span>
                  </div>
                )
              })}
            </>
          )}

          {/* Qty found input */}
          {showQtyInput && (
            <div className="qty-found-wrap">
              <label className="detail-section-title">
                Qty Found
                <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 6 }}>
                  (of {qtyNum})
                </span>
              </label>
              <input
                className="qty-found-input"
                type="number"
                min={0}
                max={qtyNum * 2}
                placeholder="0"
                value={qtyValue !== '' ? qtyValue : (storedQtyFound !== null ? String(storedQtyFound) : '')}
                onChange={e => handleQtyChange(e.target.value)}
              />
            </div>
          )}

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
        </div>
      )}
    </div>
  )
}
