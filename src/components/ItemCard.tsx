import { useState, useCallback, useRef, useEffect } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { useRealtimeStore } from '../stores/realtimeStore'
import { useAppStore } from '../stores/appStore'
import { getDisplayPriority } from '../lib/displayPriority'
import type { Item, DisplayConfig } from '../types'

/** Find the header that maps to a canonical field via aiFieldMap or fuzzy match. */
function findHeaderForCanonical(
  displayConfig: DisplayConfig,
  canonical: string,
  fuzzyNeedles: string[],
): string | null {
  if (displayConfig.aiFieldMap) {
    for (const [h, f] of Object.entries(displayConfig.aiFieldMap)) {
      if (f === canonical) return h
    }
  }
  // Fallback: fuzzy header-text match
  const allHeaders = [
    displayConfig.idName,
    displayConfig.descName,
    displayConfig.grpName ?? '',
    ...displayConfig.qtyNames,
    ...displayConfig.ctxNames,
  ].filter(Boolean) as string[]
  for (const h of allHeaders) {
    const n = h.toLowerCase()
    if (fuzzyNeedles.some(needle => n === needle || n.includes(needle))) return h
  }
  return null
}

interface Props {
  item: Item
  displayConfig: DisplayConfig
  searchQuery: string
  onNeedName: () => void
  hasPendingMutation?: boolean
  hasConflict?: boolean
  scanHighlight?: boolean
  scanRevision?: number
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

export default function ItemCard({ item, displayConfig, searchQuery, onNeedName, hasPendingMutation = false, hasConflict = false, scanHighlight = false, scanRevision = 0 }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [noteValue, setNoteValue] = useState<string | null>(null)
  const [noteSaving, setNoteSaving] = useState(false)
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [qtyValue, setQtyValue] = useState<string>('')
  const qtyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const qtyInputRef = useRef<HTMLInputElement>(null)

  const { checkStates, toggleCheck, updateNote, updateQtyFound } = useRealtimeStore()
  const { userName } = useAppStore()

  const state = checkStates.get(item.id)
  const isChecked = state?.checked ?? false
  const note = noteValue !== null ? noteValue : (state?.note ?? '')

  const { descName, idName, ctxNames, qtyNames, aiFieldMap } = displayConfig

  // Prefer the real AI field map when the RFE was AI-mapped on import. This
  // preserves the distinction between tag_number / item_code / label_number /
  // description so display-priority scenarios resolve correctly (e.g. an
  // item_code column still gets the "primary" slot in scenario 2).
  //
  // Fall back to a synthetic mapping from the DisplayConfig slots for older
  // RFEs that were imported before aiFieldMap existed.
  let fieldMappings: Record<string, string>
  if (aiFieldMap && Object.keys(aiFieldMap).length > 0) {
    fieldMappings = { ...aiFieldMap }
  } else {
    fieldMappings = {}
    if (idName && idName !== descName) fieldMappings[idName] = 'tag_number'
    if (descName) fieldMappings[descName] = 'description'
  }

  const display = getDisplayPriority(item.data, fieldMappings)
  const primaryTitle = display.primary
  const subtitle = display.secondary ?? ''
  const tertiary = display.third ?? ''

  // Qty column — show qty_found input if qty > 1
  const qtyColName = qtyNames[0] ?? null
  const qtyNum = qtyColName ? parseInt(item.data[qtyColName] ?? '0', 10) : 0
  const showQtyInput = qtyNum > 1
  const storedQtyFound = state?.qty_found ?? null

  // Size column — used for the always-visible size pill
  const sizeHeader = findHeaderForCanonical(displayConfig, 'size', ['size', 'dimension', 'dim'])
  const sizeValue = sizeHeader ? item.data[sizeHeader] : ''

  // Partial / full-found state derived from qty_found vs. required quantity
  const qtyFoundNum = storedQtyFound ?? 0
  const isPartial = qtyFoundNum > 0 && qtyNum > 0 && qtyFoundNum < qtyNum
  const isFullyFound = qtyNum > 0 && qtyFoundNum >= qtyNum

  // Auto-check when qty_found reaches the required quantity and the item isn't
  // already marked found. Keeps the card state coherent when the user works
  // via the quantity input instead of the checkbox.
  useEffect(() => {
    if (isFullyFound && !isChecked && userName) {
      toggleCheck(item.id, item.rfe_id, true, userName)
    }
  }, [isFullyFound, isChecked, userName, item.id, item.rfe_id, toggleCheck])

  // React to a scan hit — expand, scroll, focus qty input.
  useEffect(() => {
    if (!scanHighlight) return
    setExpanded(true)
    if (noteValue === null) setNoteValue(state?.note ?? '')
    if (storedQtyFound !== null) setQtyValue(String(storedQtyFound))
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => { qtyInputRef.current?.focus(); qtyInputRef.current?.select() }, 250)
    return () => clearTimeout(t)
  // scanRevision lets a repeat-scan on the same item re-trigger the effect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanHighlight, scanRevision])

  // Grid fields (Make, Model, Serial, Year, Status) from ctxNames
  const gridFields = ctxNames.filter(c => isGridField(c))
  // Secondary identifier derived from a composite column — e.g. equipment_code
  // extracted from a composite Asset ID. Surfaced as a small subtitle line
  // instead of the ugly joined composite value.
  const compositeEquipHeader = (() => {
    if (!displayConfig.compositeParts) return null
    for (const [h, spec] of Object.entries(displayConfig.compositeParts)) {
      const idx = spec.parts.indexOf('equipment_code')
      if (idx === -1) continue
      const key = `${h}__part__equipment_code`
      if (item.data[key]) return key
    }
    return null
  })()
  const compositeEquipValue = compositeEquipHeader ? item.data[compositeEquipHeader] : null

  const extraFields = Object.keys(item.data).filter(k => {
    if (k === idName || k === descName) return false
    if (qtyNames.includes(k)) return false
    if (gridFields.includes(k)) return false
    // Hide the synthetic keys from the detail grid — they're surfaced elsewhere
    // (equipment_code as a subtitle) or kept for search/debugging only.
    if (k.includes('__part__')) return false
    if (k.endsWith('__raw')) return false
    return true
  })

  const handleCheck = useCallback(() => {
    if (!userName) { onNeedName(); return }
    try { navigator.vibrate?.(isChecked ? 8 : 15) } catch { /* unsupported */ }
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
    <div
      ref={cardRef}
      className={`item-card${isChecked ? ' checked' : ''}${hasConflict ? ' conflict' : ''}${isPartial ? ' partial' : ''}${scanHighlight ? ' scan-hit' : ''}`}
      style={isPartial ? { background: 'var(--amber-light)', borderColor: 'var(--amber)' } : undefined}
    >
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
          {compositeEquipValue && (
            <div className="item-tertiary" style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>
              {highlight(compositeEquipValue, searchQuery)}
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

          {/* Always-visible Size + Qty pills (line 3) — never hidden behind expand */}
          {(sizeValue || qtyNum > 0) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {sizeValue && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: 'var(--border-light, #e5e7eb)',
                    color: 'var(--text2)',
                  }}
                >
                  Size: {sizeValue}
                </span>
              )}
              {qtyNum > 0 && (
                <span
                  className="item-tag qty"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: 'var(--green-light)',
                    color: 'var(--green-dark)',
                  }}
                >
                  Qty: {qtyNum}
                </span>
              )}
            </div>
          )}

          {/* Partial quantity indicator */}
          {isPartial && (
            <div
              role="status"
              aria-label={`Partially found: ${qtyFoundNum} of ${qtyNum}`}
              style={{
                marginTop: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--amber-dark)',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: 0.5,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: 'var(--amber)',
                  color: '#fff',
                }}
                aria-hidden="true"
              >
                PARTIAL
              </span>
              <span aria-hidden="true">{qtyFoundNum} / {qtyNum} found</span>
            </div>
          )}

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
                ref={qtyInputRef}
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
