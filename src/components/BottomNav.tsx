import { ClipboardCheck, Package, Upload, Settings, type LucideIcon } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import type { ViewTab } from '../types'

const TABS: { id: ViewTab; label: string; Icon: LucideIcon }[] = [
  { id: 'checklist', label: 'Checklist', Icon: ClipboardCheck },
  { id: 'inventory', label: 'Inventory', Icon: Package },
  { id: 'import',    label: 'Import',    Icon: Upload },
  { id: 'settings',  label: 'Settings',  Icon: Settings },
]

export default function BottomNav() {
  const { activeTab, setActiveTab } = useAppStore()

  return (
    <nav className="bottomnav">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`nav-tab${activeTab === id ? ' active' : ''}`}
          onClick={() => setActiveTab(id)}
          aria-label={label}
        >
          <Icon size={22} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
