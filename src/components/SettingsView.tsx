import { useState } from 'react'
import { User, Moon, Sun, Info, Trash2, Wifi, RotateCcw, Lock, Package } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useRealtimeStore } from '../stores/realtimeStore'

export default function SettingsView() {
  const { userName, setUserName, darkMode, toggleDarkMode, currentRfeId } = useAppStore()
  const { rfeList, resetChecks, deleteRFE, realtimeConnected } = useRealtimeStore()
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(userName)
  const [saved, setSaved] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  // Manage-Inventory state
  const [manageMode, setManageMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const currentRfe = rfeList.find(r => r.id === currentRfeId)
  const currentRfeFinalized = currentRfe?.status === 'finalized'

  const toggleSelected = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const exitManageMode = () => {
    setManageMode(false)
    setSelectedIds(new Set())
    setConfirmDelete(false)
  }

  const handleBatchDelete = async () => {
    setDeleting(true)
    try {
      // Sequential delete — keeps optimistic updates consistent and avoids
      // hammering Supabase with a parallel storm on slow connections.
      for (const id of selectedIds) {
        await deleteRFE(id)
      }
    } finally {
      setDeleting(false)
      exitManageMode()
    }
  }

  const saveName = () => {
    setUserName(nameInput)
    setEditingName(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = async () => {
    if (!currentRfeId || currentRfeFinalized) return
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
                <div className="settings-row-sub">
                  {currentRfeFinalized
                    ? `Locked — re-open "${currentRfe.name}" first to reset`
                    : `Clear all checks for: ${currentRfe.name}`}
                </div>
              </div>
            </div>

            {!showResetConfirm && !resetDone && (
              <div style={{ padding: '8px 16px 14px' }}>
                <button
                  onClick={() => !currentRfeFinalized && setShowResetConfirm(true)}
                  disabled={currentRfeFinalized}
                  aria-disabled={currentRfeFinalized}
                  style={{
                    width: '100%', padding: '11px', borderRadius: 8, fontWeight: 700,
                    fontSize: 14,
                    color: currentRfeFinalized ? 'var(--text3)' : '#ef4444',
                    border: `1.5px solid ${currentRfeFinalized ? 'var(--border)' : '#fecaca'}`,
                    background: currentRfeFinalized ? 'var(--bg)' : '#fff1f1',
                    cursor: currentRfeFinalized ? 'not-allowed' : 'pointer',
                    opacity: currentRfeFinalized ? 0.6 : 1,
                  }}
                >
                  {currentRfeFinalized ? 'Reset disabled — list finalized' : 'Reset All Checks…'}
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
              <div className="settings-row-label">CheckFlow</div>
              <div className="settings-row-sub">v2.1 · Vite + React + Supabase</div>
            </div>
          </div>
        </div>

        {/* Manage Inventory — multi-select delete with finalized lock */}
        <div className="settings-section">
          <div className="settings-section-title">Manage Inventory</div>
          <div className="settings-row" style={{ cursor: 'default' }}>
            <span className="settings-row-icon"><Package size={18} /></span>
            <div className="settings-row-info">
              <div className="settings-row-label">Delete Lists</div>
              <div className="settings-row-sub">
                {manageMode
                  ? `${selectedIds.size} selected${selectedIds.size > 0 ? ' — finalized lists are locked' : ''}`
                  : 'Select lists to remove permanently'}
              </div>
            </div>
            {!manageMode ? (
              <button
                className="settings-mini-btn"
                onClick={() => setManageMode(true)}
                disabled={rfeList.length === 0}
                aria-label="Enter manage-inventory mode"
              >
                <Trash2 size={14} /> Manage
              </button>
            ) : (
              <button
                className="settings-mini-btn ghost"
                onClick={exitManageMode}
                aria-label="Exit manage mode"
              >
                Done
              </button>
            )}
          </div>

          {manageMode && (
            <div className="manage-inventory-list">
              {rfeList.length === 0 && (
                <p style={{ padding: '10px 16px', color: 'var(--text3)', fontSize: 13 }}>
                  No lists to manage.
                </p>
              )}
              {rfeList.map(rfe => {
                const locked = rfe.status === 'finalized'
                const checked = selectedIds.has(rfe.id)
                return (
                  <label
                    key={rfe.id}
                    className={`manage-inventory-row${locked ? ' locked' : ''}`}
                    aria-disabled={locked || undefined}
                  >
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={checked}
                      onChange={() => !locked && toggleSelected(rfe.id)}
                      aria-label={`Select ${rfe.name} for deletion`}
                    />
                    <div className="manage-inventory-text">
                      <div className="manage-inventory-name">
                        {rfe.name}
                        {locked && <Lock size={11} aria-label="finalized — locked" />}
                      </div>
                      <div className="manage-inventory-sub">
                        {rfe.count} items
                        {rfe.reference_id ? ` · Ref ${rfe.reference_id}` : ''}
                      </div>
                    </div>
                  </label>
                )
              })}

              {selectedIds.size > 0 && (
                <div style={{ padding: '10px 16px 14px' }}>
                  {!confirmDelete ? (
                    <button
                      className="settings-delete-btn"
                      onClick={() => setConfirmDelete(true)}
                      disabled={deleting}
                    >
                      <Trash2 size={14} /> Delete {selectedIds.size} Selected
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                        Permanently delete <strong>{selectedIds.size}</strong> {selectedIds.size === 1 ? 'list' : 'lists'}?
                        This removes all items and check history. Cannot be undone.
                      </p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => setConfirmDelete(false)}
                          disabled={deleting}
                          style={{ flex: 1, padding: '10px', borderRadius: 8, fontSize: 14, fontWeight: 600, color: 'var(--text2)', border: '1px solid var(--border)', background: 'var(--card-bg)' }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleBatchDelete}
                          disabled={deleting}
                          style={{ flex: 1, padding: '10px', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#fff', background: '#ef4444' }}
                        >
                          {deleting ? 'Deleting…' : 'Yes, Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
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
