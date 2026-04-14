import { X, User } from 'lucide-react'
import { useAppStore } from '../stores/appStore'

// ── Right Panel: Settings/name entry only (left panel removed — bottom nav handles navigation) ──
function RightPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { userName, setUserName, setActiveTab } = useAppStore()

  return (
    <div className={`slide-panel right${open ? ' open' : ''}`}>
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2>Quick Settings</h2>
          <button
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <p>Your identity for check-offs</p>
      </div>
      <div className="panel-body" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <User size={16} style={{ color: 'var(--text3)' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
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
          style={{ marginTop: 16, width: '100%' }}
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

export default function SlidePanel() {
  const { rightPanelOpen, setRightPanelOpen } = useAppStore()

  return (
    <>
      <div
        className={`panel-overlay${rightPanelOpen ? ' visible' : ''}`}
        style={{ pointerEvents: rightPanelOpen ? 'auto' : 'none' }}
        onClick={() => setRightPanelOpen(false)}
      />
      <RightPanel open={rightPanelOpen} onClose={() => setRightPanelOpen(false)} />
    </>
  )
}
