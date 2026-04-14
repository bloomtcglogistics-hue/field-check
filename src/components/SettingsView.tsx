import { useState } from 'react'
import { User, Moon, Sun, Info, Trash2, Wifi, RotateCcw } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useRealtimeStore } from '../stores/realtimeStore'

export default function SettingsView() {
  const { userName, setUserName, darkMode, toggleDarkMode, currentRfeId } = useAppStore()
  const { rfeList, resetChecks, realtimeConnected } = useRealtimeStore()
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(userName)
  const [saved, setSaved] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  const currentRfe = rfeList.find(r => r.id === currentRfeId)

  const saveName = () => {
    setUserName(nameInput)
    setEditingName(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = async () => {
    if (!currentRfeId) return
    await resetChecks(currentRfeId)
    setShowResetConfirm(false)
    setResetDone(true)
    setTimeout(() => setResetDone(false), 2500)
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

        {/* Appearance */}
        <div className="settings-section">
          <div className="settings-section-title">Appearance</div>
          <div className="settings-row" onClick={toggleDarkMode} style={{ cursor: 'pointer' }}>
            <span className="settings-row-icon">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </span>
            <div className="settings-row-info">
              <div className="settings-row-label">Dark Mode</div>
              <div className="settings-row-sub">{darkMode ? 'On — tap to disable' : 'Off — tap to enable'}</div>
            </div>
            <div className={`toggle-switch${darkMode ? ' on' : ''}`}>
              <div className="toggle-thumb" />
            </div>
          </div>
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
            <span style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 20, fontWeight: 700,
              background: realtimeConnected ? '#dcfce7' : '#fee2e2',
              color: realtimeConnected ? '#15803d' : '#991b1b',
            }}>
              {realtimeConnected ? 'LIVE' : 'OFF'}
            </span>
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

        {/* Reset Checks */}
        {currentRfe && (
          <div className="settings-section">
            <div className="settings-section-title">Danger Zone</div>
            <div className="settings-row" style={{ cursor: 'default' }}>
              <span className="settings-row-icon"><RotateCcw size={18} style={{ color: '#ef4444' }} /></span>
              <div className="settings-row-info">
                <div className="settings-row-label" style={{ color: '#ef4444' }}>Reset Active List</div>
                <div className="settings-row-sub">Clear all checks for: {currentRfe.name}</div>
              </div>
            </div>

            {!showResetConfirm && !resetDone && (
              <div style={{ padding: '8px 16px 14px' }}>
                <button
                  onClick={() => setShowResetConfirm(true)}
                  style={{
                    width: '100%', padding: '11px', borderRadius: 8, fontWeight: 700,
                    fontSize: 14, color: '#ef4444', border: '1.5px solid #fecaca',
                    background: '#fff1f1',
                  }}
                >
                  Reset All Checks…
                </button>
              </div>
            )}

            {showResetConfirm && (
              <div style={{ padding: '8px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                  This will clear all checkmarks for <strong>{currentRfe.name}</strong>. This cannot be undone.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    style={{ flex: 1, padding: '10px', borderRadius: 8, fontSize: 14, fontWeight: 600, color: 'var(--text2)', border: '1px solid var(--border)', background: 'var(--card-bg)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReset}
                    style={{ flex: 1, padding: '10px', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#fff', background: '#ef4444' }}
                  >
                    Yes, Reset
                  </button>
                </div>
              </div>
            )}

            {resetDone && (
              <div style={{ padding: '8px 16px 14px' }}>
                <div style={{ fontSize: 13, color: '#15803d', fontWeight: 600, padding: '10px', background: '#dcfce7', borderRadius: 8, textAlign: 'center' }}>
                  ✓ Checks reset successfully
                </div>
              </div>
            )}
          </div>
        )}

        {/* About */}
        <div className="settings-section">
          <div className="settings-section-title">About</div>
          <div className="settings-row" style={{ cursor: 'default' }}>
            <span className="settings-row-icon"><Info size={18} /></span>
            <div className="settings-row-info">
              <div className="settings-row-label">TCG Field Check</div>
              <div className="settings-row-sub">v2.1 · Vite + React + Supabase</div>
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

        {/* Migration SQL notice */}
        <div className="settings-section">
          <div className="settings-section-title">DB Migration</div>
          <div style={{ padding: '10px 16px 14px' }}>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8, lineHeight: 1.6 }}>
              Run this in Supabase SQL Editor to enable qty_found tracking:
            </p>
            <pre style={{
              fontSize: 11, background: 'var(--bg)', borderRadius: 6,
              padding: '10px', color: 'var(--text2)', overflowX: 'auto',
              border: '1px solid var(--border)', lineHeight: 1.5,
            }}>
{`ALTER TABLE fc_check_state
  ADD COLUMN IF NOT EXISTS
  qty_found integer DEFAULT NULL;`}
            </pre>
          </div>
        </div>

      </div>
    </div>
  )
}
