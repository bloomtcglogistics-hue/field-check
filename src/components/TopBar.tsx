import { Settings } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useRealtimeStore } from '../stores/realtimeStore'
import { useOnlineStatus } from '../lib/syncEngine'

export default function TopBar() {
  const { activeTab, currentRfeId, setRightPanelOpen } = useAppStore()
  const { rfeList, items, checkStates, realtimeConnected } = useRealtimeStore()
  const { isOnline, pendingCount } = useOnlineStatus()

  const currentRfe = rfeList.find(r => r.id === currentRfeId)

  let title = 'TCG Field Check'
  let subtitle = ''

  if (activeTab === 'checklist') {
    if (currentRfe) {
      title = currentRfe.name
      const checked = items.filter(it => checkStates.get(it.id)?.checked).length
      subtitle = `${checked} / ${items.length} verified`
    } else {
      subtitle = 'Select a list from Inventory'
    }
  } else if (activeTab === 'inventory') {
    subtitle = `${rfeList.length} list${rfeList.length !== 1 ? 's' : ''}`
  } else if (activeTab === 'import') {
    subtitle = 'CSV or Excel file'
  }

  return (
    <div className="topbar">
      <div className="topbar-brand">
        <div className="topbar-title">TCG Field Check</div>
        {subtitle && <div className="topbar-sub">{subtitle}</div>}
        {activeTab === 'checklist' && currentRfe && title !== 'TCG Field Check' && (
          <div className="topbar-context">{title}</div>
        )}
      </div>

      <div className="topbar-right">
        {/* Offline / online / sync status */}
        {activeTab === 'checklist' && currentRfeId && (() => {
          if (!isOnline && pendingCount > 0) {
            return (
              <div className="live-status offline" title={`Offline · ${pendingCount} pending`}>
                <div className="live-dot offline" />
                <span className="live-label">Offline · {pendingCount} pending</span>
              </div>
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
              <div className="live-status syncing" title={`Syncing ${pendingCount} item(s)…`}>
                <div className="live-dot syncing" />
                <span className="live-label">Syncing…</span>
              </div>
            )
          }
          return (
            <div
              className={`live-dot ${realtimeConnected ? 'connected' : 'disconnected'}`}
              title={realtimeConnected ? 'Live sync active' : 'Reconnecting…'}
            />
          )
        })()}
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
