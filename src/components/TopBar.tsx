import { Menu, Settings } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useRealtimeStore } from '../stores/realtimeStore'

export default function TopBar() {
  const { activeTab, currentRfeId, setLeftPanelOpen, setRightPanelOpen } = useAppStore()
  const { rfeList, items, checkStates } = useRealtimeStore()

  const currentRfe = rfeList.find(r => r.id === currentRfeId)

  let title = 'TCG Field Check'
  let subtitle = ''

  if (activeTab === 'checklist') {
    if (currentRfe) {
      title = currentRfe.name
      const checked = items.filter(it => checkStates.get(it.id)?.checked).length
      subtitle = `${checked} / ${items.length} verified`
    } else {
      title = 'Checklist'
      subtitle = 'Select a list from Inventory'
    }
  } else if (activeTab === 'inventory') {
    title = 'Inventory'
    subtitle = `${rfeList.length} list${rfeList.length !== 1 ? 's' : ''}`
  } else if (activeTab === 'import') {
    title = 'Import List'
    subtitle = 'CSV or Excel file'
  } else if (activeTab === 'settings') {
    title = 'Settings'
  }

  return (
    <div className="topbar">
      <button className="topbar-icon-btn" onClick={() => setLeftPanelOpen(true)} aria-label="Menu">
        <Menu size={20} />
      </button>

      <div className="topbar-center">
        <div className="topbar-title">{title}</div>
        {subtitle && <div className="topbar-sub">{subtitle}</div>}
      </div>

      <button className="topbar-icon-btn" onClick={() => setRightPanelOpen(true)} aria-label="Settings">
        <Settings size={20} />
      </button>
    </div>
  )
}
