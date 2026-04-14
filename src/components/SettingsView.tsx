import { useState } from 'react'
import { User, Moon, Info, Trash2, Wifi } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useRealtimeStore } from '../stores/realtimeStore'

export default function SettingsView() {
  const { userName, setUserName } = useAppStore()
  const { rfeList } = useRealtimeStore()
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(userName)
  const [saved, setSaved] = useState(false)

  const saveName = () => {
    setUserName(nameInput)
    setEditingName(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="view-container" style={{ overflowY: 'auto' }}>
      <div className="settings-container">

        {/* Profile */}
        <div className="settings-section">
          <div className="settings-section-title">Profile</div>
          <div className="settings-row" onClick={() => { setEditingName(!editingName); setNameInput(userName) }}>
            <span className="settings-row-icon"><User size={18} /></span>
            <div className="settings-row-info">
              <div className="settings-row-label">Your Name</div>
              <div className="settings-row-sub">Shown on items you verify</div>
            </div>
            <span className="settings-row-value">{userName || 'Not set'}</span>
          </div>
          {editingName && (
            <div className="name-input-wrap">
              <input
                className="name-input"
                type="text"
                placeholder="e.g. Billy Crane"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName() }}
                autoFocus
              />
              <button className="name-save-btn" onClick={saveName}>
                {saved ? '✓ Saved' : 'Save Name'}
              </button>
            </div>
          )}
        </div>

        {/* Sync info */}
        <div className="settings-section">
          <div className="settings-section-title">Sync</div>
          <div className="settings-row" style={{ cursor: 'default' }}>
            <span className="settings-row-icon"><Wifi size={18} /></span>
            <div className="settings-row-info">
              <div className="settings-row-label">Real-time Sync</div>
              <div className="settings-row-sub">Via Supabase · updates across all devices instantly</div>
            </div>
            <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: 20, fontWeight: 700 }}>ON</span>
          </div>
        </div>

        {/* Data */}
        <div className="settings-section">
          <div className="settings-section-title">Data</div>
          <div className="settings-row" style={{ cursor: 'default' }}>
            <span className="settings-row-icon"><Info size={18} /></span>
            <div className="settings-row-info">
              <div className="settings-row-label">Inventory</div>
              <div className="settings-row-sub">{rfeList.length} list{rfeList.length !== 1 ? 's' : ''} stored in Supabase</div>
            </div>
          </div>
        </div>

        {/* Appearance — placeholder */}
        <div className="settings-section">
          <div className="settings-section-title">Appearance</div>
          <div className="settings-row" style={{ cursor: 'default', opacity: 0.5 }}>
            <span className="settings-row-icon"><Moon size={18} /></span>
            <div className="settings-row-info">
              <div className="settings-row-label">Dark Mode</div>
              <div className="settings-row-sub">Coming soon</div>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="settings-section">
          <div className="settings-section-title">About</div>
          <div className="settings-row" style={{ cursor: 'default' }}>
            <span className="settings-row-icon"><Info size={18} /></span>
            <div className="settings-row-info">
              <div className="settings-row-label">TCG Field Check</div>
              <div className="settings-row-sub">v2.0 · Vite + React + Supabase</div>
            </div>
          </div>
          <div className="settings-row" style={{ cursor: 'default' }}>
            <span className="settings-row-icon"><Trash2 size={18} /></span>
            <div className="settings-row-info">
              <div className="settings-row-label">Delete Lists</div>
              <div className="settings-row-sub">Open Inventory and tap Delete on each list</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
