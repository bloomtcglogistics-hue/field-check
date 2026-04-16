import { useEffect, useRef } from 'react'
import { X, User } from 'lucide-react'
import { useAppStore } from '../stores/appStore'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function RightPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { userName, setUserName, setActiveTab } = useAppStore()
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus trap: when the panel opens, move focus inside, trap Tab/Shift+Tab,
  // and close on Escape. Restores focus to the invoking element on close.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    // Focus the first interactive control in the panel (the close button)
    const focusables = panel.querySelectorAll<HTMLElement>(FOCUSABLE)
    focusables[0]?.focus()

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const list = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null)
      if (list.length === 0) { e.preventDefault(); return }
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }

    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  return (
    <div
      ref={panelRef}
      className={`slide-panel right${open ? ' open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Quick Settings"
      aria-hidden={!open}
    >
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2>Quick Settings</h2>
          <button
            style={{ background: 'var(--bg)', border: 'none', color: 'var(--text2)', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            onClick={onClose}
            aria-label="Close settings"
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
        aria-hidden="true"
      />
      <RightPanel open={rightPanelOpen} onClose={() => setRightPanelOpen(false)} />
    </>
  )
}
