import { Package, Upload } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useRealtimeStore } from '../stores/realtimeStore'
import RFECard from './RFECard'

export default function InventoryView() {
  const { setActiveTab, setCurrentRfeId } = useAppStore()
  const { rfeList, loading, deleteRFE, resetChecks } = useRealtimeStore()

  const handleOpen = (rfeId: string) => {
    setCurrentRfeId(rfeId)
    setActiveTab('checklist')
  }

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
          <h3>No Lists Yet</h3>
          <p>Import a CSV or Excel file to create your first equipment list.</p>
          <button
            onClick={() => setActiveTab('import')}
            style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--green)', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 700 }}
          >
            <Upload size={16} /> Import List
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="view-container" style={{ overflowY: 'auto' }}>
      <div className="inventory-list">
        {rfeList.map(rfe => (
          <InventoryRFECardWrapper
            key={rfe.id}
            rfeId={rfe.id}
            onOpen={() => handleOpen(rfe.id)}
            onDelete={() => deleteRFE(rfe.id)}
            onReset={() => resetChecks(rfe.id)}
          />
        ))}
      </div>

      {/* Import FAB */}
      <div className="fabs">
        <button
          className="fab fab-outline"
          title="Import new list"
          onClick={() => setActiveTab('import')}
        >
          <Upload size={22} />
        </button>
      </div>
    </div>
  )
}

// Reactive wrapper: derives checkedCount from live Zustand state so inventory
// cards update in real time when checks change (including resets).
function InventoryRFECardWrapper({
  rfeId, onOpen, onDelete, onReset,
}: {
  rfeId: string
  onOpen: () => void
  onDelete: () => void
  onReset: () => void
}) {
  const { currentRfeId } = useAppStore()

  const rfe = useRealtimeStore(s => s.rfeList.find(r => r.id === rfeId)!)

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

  if (!rfe) return null

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
