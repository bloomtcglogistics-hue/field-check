import { useMemo, useState, useEffect } from 'react'
import { Package, Upload, Search, X } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useRealtimeStore } from '../stores/realtimeStore'
import RFECard from './RFECard'
import type { RFEIndex } from '../types'

function matchesQuery(rfe: RFEIndex, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase().trim()
  if (!needle) return true

  if (rfe.name.toLowerCase().includes(needle)) return true
  if (rfe.reference_id && rfe.reference_id.toLowerCase().includes(needle)) return true

  // Date match — accept both the ISO YYYY-MM-DD prefix and the human display.
  const iso = rfe.imported_at ? rfe.imported_at.slice(0, 10) : ''
  if (iso && iso.toLowerCase().includes(needle)) return true
  try {
    const d = new Date(rfe.imported_at)
    const display = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    if (display.toLowerCase().includes(needle)) return true
    const long = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    if (long.toLowerCase().includes(needle)) return true
  } catch { /* ignore */ }

  return false
}

export default function InventoryView() {
  const { setActiveTab, setCurrentRfeId } = useAppStore()
  const { rfeList, loading, deleteRFE, resetChecks } = useRealtimeStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // 150ms debounce — avoids filtering on every keystroke at large list sizes
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 150)
    return () => clearTimeout(t)
  }, [searchQuery])

  const handleOpen = (rfeId: string) => {
    setCurrentRfeId(rfeId)
    setActiveTab('checklist')
  }

  const filtered = useMemo(
    () => rfeList.filter(rfe => matchesQuery(rfe, debouncedQuery)),
    [rfeList, debouncedQuery],
  )

  if (loading) {
    return (
      <div className="view-container">
        <div className="empty-state">
          <div className="spinner" />
          <p>Loading inventory…</p>
        </div>
      </div>
    )
  }

  if (rfeList.length === 0) {
    return (
      <div className="view-container">
        <div className="empty-state">
          <Package size={56} />
          <h3>No checklists yet</h3>
          <p>Import a CSV or Excel file to start verifying items in the field.</p>
          <button
            onClick={() => setActiveTab('import')}
            style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 22px', background: 'var(--green)', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 700, minHeight: 44 }}
          >
            <Upload size={16} /> Import List
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="view-container" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="inventory-search">
        <div className="inventory-search-wrap">
          <Search size={15} style={{ color: 'var(--text3)', flexShrink: 0 }} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search by title, reference ID, or date…"
            aria-label="Search checklists"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {searchQuery && (
            <button
              className="inventory-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div
          className="inventory-search-count"
          role="status"
          aria-live="polite"
        >
          {debouncedQuery
            ? `${filtered.length} of ${rfeList.length} checklist${rfeList.length === 1 ? '' : 's'}`
            : `${rfeList.length} checklist${rfeList.length === 1 ? '' : 's'}`}
        </div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <Search size={40} />
            <h3>No matches</h3>
            <p>No checklists match &ldquo;{debouncedQuery}&rdquo;. Try a different search.</p>
          </div>
        ) : (
          <div className="inventory-list">
            {filtered.map(rfe => (
              <InventoryRFECardWrapper
                key={rfe.id}
                rfe={rfe}
                onOpen={() => handleOpen(rfe.id)}
                onDelete={() => deleteRFE(rfe.id)}
                onReset={() => resetChecks(rfe.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Import FAB */}
      <div className="fabs">
        <button
          className="fab fab-outline"
          aria-label="Import new list"
          title="Import new list"
          onClick={() => setActiveTab('import')}
        >
          <Upload size={22} />
        </button>
      </div>
    </div>
  )
}

// Reactive wrapper: receives the RFEIndex by prop (parent has it from the
// filtered list) so we don't do a linear find-by-id per card on every store
// update. Only the live checkedCount / conflictCount need store selectors.
function InventoryRFECardWrapper({
  rfe, onOpen, onDelete, onReset,
}: {
  rfe: RFEIndex
  onOpen: () => void
  onDelete: () => void
  onReset: () => void
}) {
  const { currentRfeId } = useAppStore()
  const rfeId = rfe.id

  // For the currently-loaded RFE, compute count from the live checkStates map
  // (updated by realtime events and optimistic toggles). For others, use the
  // DB-fetched count map populated by loadRFEList and kept up to date on reset.
  const checkedCount = useRealtimeStore(s => {
    const loadedRfeId = s.items[0]?.rfe_id
    if (rfeId === currentRfeId && rfeId === loadedRfeId) {
      let count = 0
      for (const cs of s.checkStates.values()) {
        if (cs.checked) count++
      }
      return count
    }
    return s.rfeCheckCounts.get(rfeId) ?? 0
  })

  const conflictCount = useRealtimeStore(s =>
    s.conflicts.filter(c => c.rfeId === rfeId).length,
  )

  return (
    <RFECard
      rfe={rfe}
      checkedCount={checkedCount}
      onSelect={onOpen}
      onDelete={onDelete}
      onReset={onReset}
      hasConflicts={conflictCount > 0}
      conflictCount={conflictCount}
    />
  )
}
