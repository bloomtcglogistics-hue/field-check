import { X, ClipboardCheck, Package, Upload, Settings, User } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useRealtimeStore } from '../stores/realtimeStore'
import type { ViewTab } from '../types'

// ── Left Panel: Navigation menu ──
function LeftPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { setActiveTab, userName, currentRfeId } = useAppStore()
  const { rfeList } = useRealtimeStore()
  const currentRfe = rfeList.find(r => r.id === currentRfeId)

  const nav = (tab: ViewTab) => { setActiveTab(tab); onClose() }

  return (
    <div className={`slide-panel left${open ? ' open' : ''}`}>
      <div className="panel-header">
        <h2>TCG Field Check</h2>
        <p>{userName ? `Signed in as ${userName}` : 'Set your name in Settings'}</p>
      </div>
      <div className="panel-body">
        {currentRfe && (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>
              Active List
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{currentRfe.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>{currentRfe.count} items</div>
          </div>
        )}
        <button className="panel-item" onClick={() => nav('checklist')}>
          <ClipboardCheck size={18} /> Checklist
        </button>
        <button className="panel-item" onClick={() => nav('inventory')}>
          <Package size={18} /> Inventory
        </button>
        <button className="panel-item" onClick={() => nav('import')}>
          <Upload size={18} /> Import List
        </button>
        <button className="panel-item" onClick={() => nav('settings')}>
          <Settings size={18} /> Settings
        </button>
      </div>
    </div>
  )
}

// ── Right Panel: Quick settings ──
function RightPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { userName, setUserName, setActiveTab } = useAppStore()

  return (
    <div className={`slide-panel right${open ? ' open' : ''}`}>
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2>Quick Settings</h2>
          <button
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p>Your identity for check-offs</p>
      </div>
      <div className="panel-body" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <User size={16} style={{ color: 'var(--text3)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            Your Name
          </span>
        </div>
        <input
          className="name-input"
          type="text"
          placeholder="e.g. Billy Crane"
          value={userName}
          onChange={e => setUserName(e.target.value)}
          autoComplete="off"
        />
        <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>
          Appears on check-offs so the team knows who verified each item.
        </p>
        <button
          className="name-save-btn"
          style={{ marginTop: 16 }}
          onClick={() => {
            onClose()
            setActiveTab('settings')
          }}
        >
          Full Settings →
        </button>
      </div>
    </div>
  )
}

// ── Combined overlay + both panels ──
export default function SlidePanel() {
  const { leftPanelOpen, rightPanelOpen, setLeftPanelOpen, setRightPanelOpen } = useAppStore()

  const isAnyOpen = leftPanelOpen || rightPanelOpen
  const closeAll = () => { setLeftPanelOpen(false); setRightPanelOpen(false) }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`panel-overlay${isAnyOpen ? ' visible' : ''}`}
        style={{ pointerEvents: isAnyOpen ? 'auto' : 'none' }}
        onClick={closeAll}
      />
      <LeftPanel open={leftPanelOpen} onClose={() => setLeftPanelOpen(false)} />
      <RightPanel open={rightPanelOpen} onClose={() => setRightPanelOpen(false)} />
    </>
  )
}
