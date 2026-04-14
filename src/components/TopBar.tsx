import { useState } from 'react'
import { Settings } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useRealtimeStore } from '../stores/realtimeStore'
import { useOnlineStatus } from '../lib/useOnlineStatus'

export default function TopBar() {
  const { activeTab, currentRfeId, setRightPanelOpen } = useAppStore()
  const { rfeList, items, checkStates, realtimeConnected } = useRealtimeStore()
  const { isOnline, pendingCount } = useOnlineStatus()
  const [tipVisible, setTipVisible] = useState(false)

  const showTip = () => {
    if (pendingCount <= 0) return
    setTipVisible(true)
    setTimeout(() => setTipVisible(false), 2200)
  }

  const currentRfe = rfeList.find(r => r.id === currentRfeId)

  let subtitle = ''

  if (activeTab === 'checklist') {
    if (currentRfe) {
      const checked = items.filter(it => checkStates.get(it.id)?.checked).length
      subtitle = `${currentRfe.name} · ${checked}/${items.length}`
    } else {
      subtitle = 'Select a list from Inventory'
    }
  } else if (activeTab === 'inventory') {
    subtitle = `${rfeList.length} list${rfeList.length !== 1 ? 's' : ''}`
  } else if (activeTab === 'import') {
    subtitle = 'CSV or Excel file'
  } else if (activeTab === 'settings') {
    subtitle = 'App preferences'
  }

  return (
    <div className="topbar">
      <div className="topbar-brand">
        <div className="topbar-title">TCG Field Check</div>
        {subtitle && <div className="topbar-sub">{subtitle}</div>}
      </div>

      <div className="topbar-right" style={{ position: 'relative' }}>
        {/* Offline / online / sync status — tap to see a short status tooltip
            when there are pending mutations waiting to sync. */}
        {activeTab === 'checklist' && currentRfeId && (() => {
          if (!isOnline && pendingCount > 0) {
            return (
              <button
                type="button"
                className="live-status offline"
                title={`Offline · ${pendingCount} pending`}
                onClick={showTip}
              >
                <div className="live-dot offline" />
                <span className="live-label">Offline · {pendingCount} pending</span>
              </button>
            )
          }
          if (!isOnline) {
            return (
              <div className="live-status offline" title="Offline">
                <div className="live-dot offline" />
                <span className="live-label">Offline</span>
              </div>
            )
          }
          if (pendingCount > 0) {
            return (
              <button
                type="button"
                className="live-status syncing"
                title={`Syncing ${pendingCount} item(s)…`}
                onClick={showTip}
              >
                <div className="live-dot syncing" />
                <span className="live-label">Syncing…</span>
              </button>
            )
          }
          return (
            <div
              className={`live-dot ${realtimeConnected ? 'connected' : 'disconnected'}`}
              title={realtimeConnected ? 'Live sync active' : 'Reconnecting…'}
            />
          )
        })()}
        {tipVisible && pendingCount > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 8,
              background: '#111827',
              color: '#fff',
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 12,
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              zIndex: 1000,
            }}
          >
            {pendingCount} change{pendingCount === 1 ? '' : 's'} waiting to sync
          </div>
        )}
        <button
          className="topbar-icon-btn"
          onClick={() => setRightPanelOpen(true)}
          aria-label="Settings"
        >
          <Settings size={20} />
        </button>
      </div>
    </div>
  )
}
