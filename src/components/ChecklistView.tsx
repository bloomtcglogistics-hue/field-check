import { useMemo, useState, useEffect } from 'react'
import { FileX, Download } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useRealtimeStore } from '../stores/realtimeStore'
import { generateHTMLReport, downloadReport } from '../lib/exportReport'
import SearchBar from './SearchBar'
import FilterBar from './FilterBar'
import ItemCard from './ItemCard'
import type { Item } from '../types'

// ── Name prompt modal ──
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
  const { currentRfeId, userName, setUserName, searchQuery, filter, setActiveTab } = useAppStore()
  const { rfeList, items, checkStates, loading, loadRFE, subscribeToRFE, selectAllFiltered } = useRealtimeStore()
  const [showNameModal, setShowNameModal] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)

  const currentRfe = rfeList.find(r => r.id === currentRfeId)

  // Load items whenever the selected RFE changes
  useEffect(() => {
    if (currentRfeId) {
      loadRFE(currentRfeId)
      subscribeToRFE(currentRfeId)
    }
  }, [currentRfeId])

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2200)
  }

  // Derive unique group values from items
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

  // Apply search + filters
  const filtered = useMemo((): Item[] => {
    let list = [...items]
    const q = searchQuery.toLowerCase().trim()
    const grpName = currentRfe?.display_config.grpName

    // Search
    if (q) {
      list = list.filter(it =>
        Object.values(it.data).some(v => v.toLowerCase().includes(q))
      )
    }

    // Status filter
    if (filter.statusFilter === 'checked') {
      list = list.filter(it => checkStates.get(it.id)?.checked)
    } else if (filter.statusFilter === 'unchecked') {
      list = list.filter(it => !checkStates.get(it.id)?.checked)
    }

    // Group filter
    if (filter.groupByEnabled && filter.group && grpName) {
      list = list.filter(it => it.data[grpName] === filter.group)
    }

    // Sort
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

    return list
  }, [items, searchQuery, filter, checkStates, currentRfe])

  // Grouping
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

  // Stats
  const total = items.length
  const checkedCount = items.filter(it => checkStates.get(it.id)?.checked).length
  const pct = total > 0 ? Math.round((checkedCount / total) * 100) : 0
  const filteredIds = filtered.map(it => it.id)
  const filteredChecked = filteredIds.filter(id => checkStates.get(id)?.checked).length
  const allFilteredChecked = filteredIds.length > 0 && filteredChecked === filteredIds.length

  // No RFE selected
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
      {/* Progress */}
      <div className="progress-section">
        <div className="progress-row">
          <span className="progress-label">{checkedCount} of {total} verified</span>
          <span className="progress-pct">{pct}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Search */}
      <SearchBar />

      {/* Filters */}
      <FilterBar groups={groups} />

      {/* Select all bar */}
      {filtered.length > 0 && (
        <div className="select-bar">
          <span className="select-bar-info">
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
            {searchQuery || filter.statusFilter !== 'all' ? ' (filtered)' : ''}
          </span>
          <div className="select-bar-btns">
            <button
              className="select-btn"
              onClick={() => {
                if (!userName) { setShowNameModal(true); return }
                const target = !allFilteredChecked
                selectAllFiltered(filteredIds, currentRfeId, !allFilteredChecked, userName)
                showToast(allFilteredChecked ? 'Deselected all' : `Marked ${filteredIds.length} as found`)
              }}
            >
              {allFilteredChecked ? 'Deselect All' : 'Select All'}
            </button>
          </div>
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
            const html = generateHTMLReport(currentRfe, items, checkStates)
            downloadReport(html, currentRfe)
            showToast('Report downloaded')
          }}
        >
          <Download size={22} />
        </button>
      </div>

      {/* Name modal */}
      {showNameModal && (
        <NameModal
          onSave={name => {
            setUserName(name)
            setShowNameModal(false)
          }}
        />
      )}

      {/* Toast */}
      <div className={`toast${toastVisible ? ' visible' : ''}`}>{toastMsg}</div>
    </div>
  )
}
