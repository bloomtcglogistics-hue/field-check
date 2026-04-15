import { useMemo, useState, useEffect } from 'react'
import { FileX, Download } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useRealtimeStore } from '../stores/realtimeStore'
import { generatePDFReport, generateHTMLReportLegacy, downloadReport } from '../lib/exportReport'
import SearchBar from './SearchBar'
import FilterBar from './FilterBar'
import ItemCard from './ItemCard'
import ConflictBanner from './ConflictBanner'
import type { Item } from '../types'

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
  const { rfeList, items, checkStates, loading, loadRFE, subscribeToRFE, selectAllFiltered, conflicts, pendingItemIds } = useRealtimeStore()
  const conflictItemIds = useMemo(() => new Set(conflicts.map(c => c.itemId)), [conflicts])
  const [showNameModal, setShowNameModal] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const currentRfe = rfeList.find(r => r.id === currentRfeId)

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
    if (sortCol) {
      list.sort((a, b) => {
        const av = (a.data[sortCol] ?? '').toLowerCase()
        const bv = (b.data[sortCol] ?? '').toLowerCase()
        const cmp = av.localeCompare(bv)
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
  const allFilteredChecked = filteredIds.length > 0 && filteredChecked === filteredIds.length

  const handleSortCol = (col: string) => {
    if (sortCol === col) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortCol(null); setSortDir('asc') }
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  // Column headers for sort — id + desc + up to 3 context cols
  const sortHeaders = currentRfe ? [
    currentRfe.display_config.idName,
    currentRfe.display_config.descName,
    ...currentRfe.display_config.ctxNames.slice(0, 3),
  ].filter((h, i, arr) => h && arr.indexOf(h) === i) : []

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

      {/* Progress bar */}
      <div className="progress-section">
        <div className="progress-row">
          <span className="progress-label">{checkedCount} / {total} items checked</span>
          <span className="progress-pct">{pct}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Search */}
      <SearchBar resultCount={filtered.length} totalCount={total} />

      {/* Filters */}
      <FilterBar groups={groups} />

      {/* Select All / Deselect All + sort headers */}
      {filtered.length > 0 && (
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

      {/* Column sort headers */}
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

      {/* Item list */}
      <div className="view-container" style={{ overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <FileX size={40} />
            <h3>No Items Found</h3>
            <p>{searchQuery ? `No matches for "${searchQuery}"` : 'No items match the current filter.'}</p>
          </div>
        ) : (
          grouped.map(({ group, items: groupItems }) => (
            <div key={group ?? '_all'} className="item-list">
              {group && <div className="group-header">{group}</div>}
              {groupItems.map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
                  displayConfig={currentRfe.display_config}
                  searchQuery={searchQuery}
                  onNeedName={() => setShowNameModal(true)}
                  hasPendingMutation={pendingItemIds.has(item.id)}
                  hasConflict={conflictItemIds.has(item.id)}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Export FAB */}
      <div className="fabs">
        <button
          className="fab fab-primary"
          title="Export report"
          onClick={() => {
            console.log('[Export] Generating PDF report (online=' + navigator.onLine + ')')
            try {
              generatePDFReport(currentRfe, items, checkStates, userName)
              showToast(navigator.onLine ? 'PDF report downloaded' : 'PDF report downloaded (offline)')
            } catch (err) {
              console.error('[Export] PDF failed, falling back to HTML:', err)
              const html = generateHTMLReportLegacy(currentRfe, items, checkStates, userName)
              downloadReport(html, currentRfe)
              showToast('Report downloaded (HTML fallback)')
            }
          }}
        >
          <Download size={22} />
        </button>
      </div>

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
