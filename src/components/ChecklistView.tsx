import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { FileX, Download, Lock, FileEdit, Save, Play, X, MoreVertical } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useRealtimeStore } from '../stores/realtimeStore'
import { generatePDFReport, generateHTMLReportLegacy, downloadReport } from '../lib/exportReport'
import SearchScanBar, { type SearchScanBarHandle } from './SearchScanBar'
import FilterBar from './FilterBar'
import VirtualItemList from './VirtualItemList'
import ConflictBanner from './ConflictBanner'
import type { Item, DisplayConfig } from '../types'

const FILTERS_OPEN_KEY = 'fc_filters_open_v1'

/** Parse values like `1/2"`, `3/4`, `1 1/2"`, `2`, `12.5` into a comparable
 *  number. Returns NaN if no numeric content is found. Used to sort Size
 *  columns in the expected fractional-ascending order. */
function parseSize(raw: string): number {
  if (!raw) return NaN
  const s = raw.trim().replace(/["']/g, '')
  // "1 1/2" — whole + fraction
  const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/)
  if (mixed) {
    const a = parseFloat(mixed[1])
    const n = parseFloat(mixed[2])
    const d = parseFloat(mixed[3])
    if (d !== 0) return a + n / d
  }
  // "1/2" — pure fraction
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)/)
  if (frac) {
    const n = parseFloat(frac[1])
    const d = parseFloat(frac[2])
    if (d !== 0) return n / d
  }
  // Plain number, possibly followed by a unit
  const num = s.match(/^-?\d+(?:\.\d+)?/)
  if (num) return parseFloat(num[0])
  return NaN
}

function parseNumericQty(raw: string): number {
  if (!raw) return NaN
  const n = parseFloat(raw.replace(/,/g, '.').replace(/[^\d.\-]/g, ''))
  return isNaN(n) ? NaN : n
}

/** Find header mapped to `canonical`, falling back to fuzzy header names. */
function findHeaderForCanonical(
  config: DisplayConfig,
  canonical: string,
  fuzzyNeedles: string[],
): string | null {
  if (config.aiFieldMap) {
    for (const [h, f] of Object.entries(config.aiFieldMap)) {
      if (f === canonical) return h
    }
  }
  const all = [
    config.idName, config.descName, config.grpName ?? '',
    ...config.qtyNames, ...config.ctxNames,
  ].filter(Boolean) as string[]
  for (const h of all) {
    const n = h.toLowerCase()
    if (fuzzyNeedles.some(needle => n === needle || n.includes(needle))) return h
  }
  return null
}

function NameModal({ onSave }: { onSave: (name: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <div className="modal-overlay" onClick={e => e.stopPropagation()}>
      <div className="modal">
        <h3>What's your name?</h3>
        <p>Your name will appear on items you verify, so the whole team can see who found what.</p>
        <input
          className="modal-input"
          type="text"
          placeholder="e.g. Billy Crane"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && value.trim()) onSave(value.trim()) }}
          autoFocus
        />
        <button
          className="modal-btn"
          onClick={() => { if (value.trim()) onSave(value.trim()) }}
        >
          Save &amp; Continue
        </button>
      </div>
    </div>
  )
}

export default function ChecklistView() {
  const { currentRfeId, userName, setUserName, searchQuery, filter, setFilter, setActiveTab } = useAppStore()
  const {
    rfeList, items, checkStates, loading, loadRFE, subscribeToRFE, selectAllFiltered,
    conflicts, pendingItemIds, finalizeRFE, draftRFE, activateRFE,
  } = useRealtimeStore()
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [confirmReopen, setConfirmReopen] = useState(false)
  const [fabMenuOpen, setFabMenuOpen] = useState(false)
  const fabContainerRef = useRef<HTMLDivElement>(null)
  const conflictItemIds = useMemo(() => new Set(conflicts.map(c => c.itemId)), [conflicts])
  const [showNameModal, setShowNameModal] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [scanHighlightId, setScanHighlightId] = useState<string | null>(null)
  const [scanRevision, setScanRevision] = useState(0)
  const scanBarRef = useRef<SearchScanBarHandle>(null)

  const [filtersOpen, setFiltersOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(FILTERS_OPEN_KEY) === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem(FILTERS_OPEN_KEY, filtersOpen ? '1' : '0') } catch { /* ignore */ }
  }, [filtersOpen])

  const currentRfe = rfeList.find(r => r.id === currentRfeId)
  const status = currentRfe?.status ?? 'active'
  const isFinalized = status === 'finalized'
  const isDraft = status === 'draft'

  useEffect(() => {
    if (currentRfeId) {
      loadRFE(currentRfeId)
      subscribeToRFE(currentRfeId)
    }
  }, [currentRfeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2200)
  }

  useEffect(() => {
    if (!scanHighlightId) return
    const t = setTimeout(() => setScanHighlightId(null), 3000)
    return () => clearTimeout(t)
  }, [scanHighlightId, scanRevision])

  const handleScanMatch = (itemId: string) => {
    setScanHighlightId(itemId)
    setScanRevision(r => r + 1)
  }

  const closeFabMenu = useCallback(() => setFabMenuOpen(false), [])

  // Escape + outside-tap close the FAB speed-dial. Only bound while open so
  // we aren't listening globally when the menu is idle.
  useEffect(() => {
    if (!fabMenuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeFabMenu() }
    const onPointer = (e: PointerEvent) => {
      const el = fabContainerRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) closeFabMenu()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [fabMenuOpen, closeFabMenu])

  // Global keyboard-wedge scanner listener — hardware scanners type characters
  // very quickly and terminate with Enter. We buffer rapid input when no text
  // field is focused and submit it through the ScanBar.
  useEffect(() => {
    if (!currentRfeId) return
    let buffer = ''
    let lastKeyTs = 0
    const BURST_MS = 40 // inter-character gap typical of wedge scanners
    const MIN_LEN = 3   // avoid stray keystrokes triggering scans

    const isTypingTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (el.isContentEditable) return true
      return false
    }

    const handler = (e: KeyboardEvent) => {
      // Ignore modifier combos and typing into other fields
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingTarget(e.target)) return

      const now = performance.now()
      if (now - lastKeyTs > BURST_MS) buffer = ''
      lastKeyTs = now

      if (e.key === 'Enter') {
        if (buffer.length >= MIN_LEN) {
          const code = buffer
          buffer = ''
          e.preventDefault()
          scanBarRef.current?.submitCode(code)
        }
        return
      }
      if (e.key.length === 1) buffer += e.key
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentRfeId])

  const groups = useMemo(() => {
    if (!currentRfe?.display_config.grpName) return []
    const grpName = currentRfe.display_config.grpName
    const seen = new Set<string>()
    for (const it of items) {
      const v = it.data[grpName]
      if (v) seen.add(v)
    }
    return [...seen].sort()
  }, [items, currentRfe])

  const filtered = useMemo((): Item[] => {
    let list = [...items]
    const q = searchQuery.toLowerCase().trim()
    const grpName = currentRfe?.display_config.grpName

    if (q) {
      list = list.filter(it =>
        Object.values(it.data).some(v => v.toLowerCase().includes(q))
      )
    }

    if (filter.statusFilter === 'checked') {
      list = list.filter(it => checkStates.get(it.id)?.checked)
    } else if (filter.statusFilter === 'unchecked') {
      list = list.filter(it => !checkStates.get(it.id)?.checked)
    }

    if (filter.groupByEnabled && filter.group && grpName) {
      list = list.filter(it => it.data[grpName] === filter.group)
    }

    // Sort
    if (sortCol && currentRfe) {
      const cfg = currentRfe.display_config
      const sizeH = findHeaderForCanonical(cfg, 'size', ['size', 'dimension', 'dim'])
      const qtyH = cfg.qtyNames[0] ?? findHeaderForCanonical(cfg, 'quantity', ['qty', 'quantity', 'count'])
      const isSize = sortCol === sizeH
      const isQty = sortCol === qtyH
      list.sort((a, b) => {
        const av = a.data[sortCol] ?? ''
        const bv = b.data[sortCol] ?? ''
        let cmp: number
        if (isSize) {
          const an = parseSize(av); const bn = parseSize(bv)
          if (isNaN(an) && isNaN(bn)) cmp = 0
          else if (isNaN(an)) cmp = 1
          else if (isNaN(bn)) cmp = -1
          else cmp = an - bn
        } else if (isQty) {
          const an = parseNumericQty(av); const bn = parseNumericQty(bv)
          if (isNaN(an) && isNaN(bn)) cmp = 0
          else if (isNaN(an)) cmp = 1
          else if (isNaN(bn)) cmp = -1
          else cmp = an - bn
        } else {
          cmp = av.toLowerCase().localeCompare(bv.toLowerCase())
        }
        return sortDir === 'asc' ? cmp : -cmp
      })
    } else {
      switch (filter.sortMode) {
        case 'alpha': {
          const descName = currentRfe?.display_config.descName ?? ''
          list.sort((a, b) => (a.data[descName] ?? '').localeCompare(b.data[descName] ?? ''))
          break
        }
        case 'status':
          list.sort((a, b) => {
            const ac = checkStates.get(a.id)?.checked ? 1 : 0
            const bc = checkStates.get(b.id)?.checked ? 1 : 0
            return ac - bc
          })
          break
        default:
          list.sort((a, b) => a.item_index - b.item_index)
      }
    }

    return list
  }, [items, searchQuery, filter, checkStates, currentRfe, sortCol, sortDir])

  const grouped = useMemo(() => {
    if (!filter.groupByEnabled || !currentRfe?.display_config.grpName) {
      return [{ group: null, items: filtered }]
    }
    const grpName = currentRfe.display_config.grpName
    const map = new Map<string, Item[]>()
    for (const it of filtered) {
      const g = it.data[grpName] || '—'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(it)
    }
    return [...map.entries()].map(([group, items]) => ({ group, items }))
  }, [filtered, filter.groupByEnabled, currentRfe])

  const total = items.length
  const checkedCount = items.filter(it => checkStates.get(it.id)?.checked).length
  const pct = total > 0 ? Math.round((checkedCount / total) * 100) : 0
  const filteredIds = filtered.map(it => it.id)
  const filteredChecked = filteredIds.filter(id => checkStates.get(id)?.checked).length

  const handleSortCol = (col: string) => {
    if (sortCol === col) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortCol(null); setSortDir('asc') }
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  // Column headers for sort — id + desc + up to 3 context cols + always Size/Qty when present
  const sortHeaders = (() => {
    if (!currentRfe) return []
    const cfg = currentRfe.display_config
    const sizeH = findHeaderForCanonical(cfg, 'size', ['size', 'dimension', 'dim'])
    const qtyH = cfg.qtyNames[0] ?? findHeaderForCanonical(cfg, 'quantity', ['qty', 'quantity', 'count'])
    const base = [
      cfg.idName,
      cfg.descName,
      ...cfg.ctxNames.slice(0, 3),
      sizeH ?? '',
      qtyH ?? '',
    ]
    return base.filter((h, i, arr) => h && arr.indexOf(h) === i) as string[]
  })()

  if (!currentRfeId || !currentRfe) {
    return (
      <div className="view-container">
        <div className="empty-state">
          <FileX size={56} />
          <h3>No List Selected</h3>
          <p>Go to Inventory and tap a list to start verifying items.</p>
          <button
            onClick={() => setActiveTab('inventory')}
            style={{ marginTop: 8, padding: '10px 20px', background: 'var(--green)', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 700 }}
          >
            Go to Inventory
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="view-container">
        <div className="empty-state">
          <div className="spinner" />
          <p>Loading items…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="view-container" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Offline conflict banner */}
      <ConflictBanner />

      {/* Compact progress bar — single line, thin track. Status pill at left
          when the list is in a non-default lifecycle state. */}
      <div className="progress-compact">
        {isFinalized && (
          <span
            className="rfe-status-badge finalized"
            role="status"
            aria-label="This list is finalized and read-only"
          >
            <Lock size={10} aria-hidden="true" /> FINALIZED
          </span>
        )}
        {isDraft && (
          <span
            className="rfe-status-badge draft"
            role="status"
            aria-label="Draft — saved for later"
          >
            <FileEdit size={10} aria-hidden="true" /> DRAFT
          </span>
        )}
        <div className="progress-track-sm">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="progress-count">{checkedCount}/{total} · {pct}%</span>
      </div>

      {/* Read-only banner when finalized — communicates locked state */}
      {isFinalized && (
        <div className="readonly-banner" role="status" aria-live="polite">
          <Lock size={14} aria-hidden="true" />
          <span>This list is finalized. Re-open to edit.</span>
        </div>
      )}

      {/* Unified search / scan + filter toggle — sticky above list */}
      <SearchScanBar
        ref={scanBarRef}
        items={items}
        displayConfig={currentRfe.display_config}
        onScanMatch={handleScanMatch}
        onScanNoMatch={code => showToast(`Item not found: "${code}"`)}
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen(o => !o)}
        resultCount={filtered.length}
        totalCount={total}
      />

      {/* Collapsible filter + sort + bulk-select section. When finalized we
          still allow filter/sort for browsing, but bulk-select is hidden. */}
      {filtersOpen && (
        <div className="filter-collapse">
          <FilterBar groups={groups} />

          {filtered.length > 0 && !isFinalized && (
            <div className="select-bar">
              <div className="select-bar-btns">
                <button
                  className="select-btn"
                  onClick={() => {
                    if (!userName) { setShowNameModal(true); return }
                    selectAllFiltered(filteredIds, currentRfeId, true, userName)
                    showToast(`Marked ${filteredIds.length} as found`)
                  }}
                >
                  Select All
                </button>
                <button
                  className="select-btn deselect"
                  onClick={() => {
                    if (!userName) { setShowNameModal(true); return }
                    selectAllFiltered(filteredIds, currentRfeId, false, userName)
                    showToast('Deselected all')
                  }}
                >
                  Deselect All
                </button>
              </div>
              <span className="select-bar-info">
                {filteredChecked}/{filteredIds.length}
              </span>
            </div>
          )}

          {sortHeaders.length > 0 && (
            <div className="sort-header-bar">
              <span className="sort-header-label">Sort by:</span>
              {sortHeaders.map(col => (
                <button
                  key={col}
                  className={`sort-header-btn${sortCol === col ? ' active' : ''}`}
                  onClick={() => handleSortCol(col)}
                >
                  {col}
                  {sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
              {sortCol && (
                <button className="sort-header-clear" onClick={() => { setSortCol(null); setSortDir('asc') }}>
                  ✕
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Item list — virtualized for 500+ item performance. When finalized we
          wrap in a class that suppresses pointer events so toggles/notes/qty
          edits cannot fire. Visual dimming comes from the same class. */}
      {filtered.length === 0 ? (
        <div className="empty-state" style={{ flex: 1 }}>
          <FileX size={40} />
          <h3>No Items Found</h3>
          <p>{searchQuery ? `No matches for "${searchQuery}"` : 'No items match the current filter.'}</p>
        </div>
      ) : (
        <div
          className={isFinalized ? 'checklist-readonly' : ''}
          aria-disabled={isFinalized || undefined}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <VirtualItemList
            grouped={grouped}
            displayConfig={currentRfe.display_config}
            searchQuery={searchQuery}
            onNeedName={() => setShowNameModal(true)}
            pendingItemIds={pendingItemIds}
            conflictItemIds={conflictItemIds}
            scanHighlightId={scanHighlightId}
            scanRevision={scanRevision}
          />
        </div>
      )}

      {/* FAB speed-dial — single primary trigger in bottom-right. Tap opens
          a vertical menu of actions above the trigger; tap-outside or Escape
          closes. Replaces the old 3-FAB stack so nothing overlaps the last
          items in the list. */}
      {(() => {
        const doExportPDF = () => {
          if (import.meta.env.DEV) console.log('[Export] Generating PDF report (online=' + navigator.onLine + ')')
          try {
            generatePDFReport(currentRfe, items, checkStates, userName)
            showToast(navigator.onLine ? 'PDF report downloaded' : 'PDF report downloaded (offline)')
          } catch (err) {
            if (import.meta.env.DEV) console.error('[Export] PDF failed, falling back to HTML:', err)
            const html = generateHTMLReportLegacy(currentRfe, items, checkStates, userName)
            downloadReport(html, currentRfe)
            showToast('Report downloaded (HTML fallback)')
          }
        }

        type FabAction = {
          key: string; label: string; icon: React.ReactNode
          variant: 'primary' | 'draft' | 'resume'
          onClick: () => void
        }
        const actions: FabAction[] = [
          {
            key: 'pdf', label: 'Export PDF', variant: 'primary',
            icon: <Download size={18} />, onClick: doExportPDF,
          },
        ]
        if (!isFinalized) {
          actions.push({
            key: 'finalize', label: 'Save & Finalize', variant: 'primary',
            icon: <Save size={18} />,
            onClick: () => {
              if (!userName) { setShowNameModal(true); return }
              setConfirmFinalize(true)
            },
          })
          if (isDraft) {
            actions.push({
              key: 'resume', label: 'Resume (Active)', variant: 'resume',
              icon: <Play size={18} />,
              onClick: async () => {
                if (!userName) { setShowNameModal(true); return }
                await activateRFE(currentRfeId, userName)
                showToast('Resumed — list is active')
              },
            })
          } else {
            actions.push({
              key: 'draft', label: 'Save as Draft', variant: 'draft',
              icon: <FileEdit size={18} />,
              onClick: async () => {
                if (!userName) { setShowNameModal(true); return }
                await draftRFE(currentRfeId, userName)
                showToast('Saved as draft')
              },
            })
          }
        } else {
          actions.push({
            key: 'reopen', label: 'Re-open List', variant: 'resume',
            icon: <Play size={18} />,
            onClick: () => {
              if (!userName) { setShowNameModal(true); return }
              setConfirmReopen(true)
            },
          })
        }

        return (
          <div
            ref={fabContainerRef}
            className={`fab-dial${fabMenuOpen ? ' open' : ''}`}
          >
            {fabMenuOpen && (
              <div className="fab-dial-menu" role="menu" aria-label="List actions">
                {actions.map(a => (
                  <button
                    key={a.key}
                    className="fab-dial-item"
                    data-variant={a.variant}
                    role="menuitem"
                    onClick={() => { setFabMenuOpen(false); a.onClick() }}
                  >
                    <span className="fab-dial-label">{a.label}</span>
                    <span className="fab-dial-icon" aria-hidden="true">{a.icon}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              className="fab fab-primary fab-dial-trigger"
              aria-label={fabMenuOpen ? 'Close actions menu' : 'Open actions menu'}
              aria-expanded={fabMenuOpen}
              aria-haspopup="menu"
              onClick={() => setFabMenuOpen(o => !o)}
            >
              {fabMenuOpen ? <X size={22} /> : <MoreVertical size={22} />}
            </button>
          </div>
        )
      })()}

      {/* Finalize confirmation */}
      {confirmFinalize && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finalize-title"
          onClick={() => setConfirmFinalize(false)}
        >
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-icon warning">
              <Lock size={24} aria-hidden="true" />
            </div>
            <h3 id="finalize-title" className="modal-title">Finalize this list?</h3>
            <p className="modal-body">
              Finalizing locks the list as read-only. You can always re-open it
              later, but other devices will see it as completed.
            </p>
            <div className="modal-actions">
              <button
                className="readonly-action secondary"
                onClick={() => setConfirmFinalize(false)}
              >
                Cancel
              </button>
              <button
                className="readonly-action primary"
                onClick={async () => {
                  await finalizeRFE(currentRfeId, userName)
                  setConfirmFinalize(false)
                  showToast('List finalized')
                }}
              >
                <Lock size={16} /> Finalize
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-open confirmation (from finalized state) */}
      {confirmReopen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reopen-title"
          onClick={() => setConfirmReopen(false)}
        >
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-icon warning">
              <Play size={24} aria-hidden="true" />
            </div>
            <h3 id="reopen-title" className="modal-title">Re-open finalized list?</h3>
            <p className="modal-body">
              This will return the list to active status so you can edit again.
              Other devices viewing it will be notified.
            </p>
            <div className="modal-actions">
              <button
                className="readonly-action secondary"
                onClick={() => setConfirmReopen(false)}
              >
                Cancel
              </button>
              <button
                className="readonly-action primary resume"
                onClick={async () => {
                  await activateRFE(currentRfeId, userName)
                  setConfirmReopen(false)
                  showToast('List re-opened — now active')
                }}
              >
                <Play size={16} /> Re-open
              </button>
            </div>
          </div>
        </div>
      )}

      {showNameModal && (
        <NameModal
          onSave={name => {
            setUserName(name)
            setShowNameModal(false)
          }}
        />
      )}

      <div className={`toast${toastVisible ? ' visible' : ''}`}>{toastMsg}</div>
    </div>
  )
}
