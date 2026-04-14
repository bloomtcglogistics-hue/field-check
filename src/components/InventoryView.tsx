import { Package, Upload } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useRealtimeStore } from '../stores/realtimeStore'
import RFECard from './RFECard'

export default function InventoryView() {
  const { setActiveTab, setCurrentRfeId } = useAppStore()
  const { rfeList, loading, deleteRFE, resetChecks } = useRealtimeStore()

  // We need per-RFE check counts. Since we only load check_state for the active RFE,
  // we fetch summary counts from the fc_rfe_index.count. For full accuracy we'd need a
  // separate query — but we cache live checked counts in a lightweight way below.
  // Assumption: checkedCount is approximated until the RFE is opened.
  // TODO: add a view or summary column to fc_rfe_index for fast count lookups.

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

// Wrapper that reads per-RFE check count from Supabase on mount
function InventoryRFECardWrapper({
  rfeId, onOpen, onDelete, onReset,
}: {
  rfeId: string
  onOpen: () => void
  onDelete: () => void
  onReset: () => void
}) {
  const { rfeList } = useRealtimeStore()
  const rfe = rfeList.find(r => r.id === rfeId)!

  // We fetch the count lazily on first render and cache it in a simple module-level map.
  // This avoids a full state store just for inventory counts.
  const [checkedCount, setCheckedCount] = React.useState<number>(inventoryCounts.get(rfeId) ?? 0)

  React.useEffect(() => {
    if (inventoryCounts.has(rfeId)) return
    import('../lib/supabase').then(({ supabase }) => {
      supabase
        .from('fc_check_state')
        .select('id', { count: 'exact', head: true })
        .eq('rfe_id', rfeId)
        .eq('checked', true)
        .then(({ count }) => {
          const c = count ?? 0
          inventoryCounts.set(rfeId, c)
          setCheckedCount(c)
        })
    })
  }, [rfeId])

  // Invalidate count after reset
  const handleReset = () => {
    inventoryCounts.delete(rfeId)
    setCheckedCount(0)
    onReset()
  }

  return (
    <RFECard
      rfe={rfe}
      checkedCount={checkedCount}
      onSelect={onOpen}
      onDelete={onDelete}
      onReset={handleReset}
    />
  )
}

// Module-level cache so counts persist across tab switches without a full store
const inventoryCounts = new Map<string, number>()

// Need React import for the wrapper component
import React from 'react'
