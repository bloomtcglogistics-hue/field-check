import { useEffect } from 'react'
import { useAppStore } from './stores/appStore'
import { useRealtimeStore } from './stores/realtimeStore'
import TopBar from './components/TopBar'
import BottomNav from './components/BottomNav'
import SlidePanel from './components/SlidePanel'
import ChecklistView from './components/ChecklistView'
import InventoryView from './components/InventoryView'
import ImportView from './components/ImportView'
import SettingsView from './components/SettingsView'
import './App.css'

export default function App() {
  const { activeTab } = useAppStore()
  const { loadRFEList, subscribeToRFEList, unsubscribeAll } = useRealtimeStore()

  useEffect(() => {
    loadRFEList()
    subscribeToRFEList()
    return () => unsubscribeAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <TopBar />

      {/* Main content area — each view manages its own scroll */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {activeTab === 'checklist'  && <ChecklistView />}
        {activeTab === 'inventory'  && <InventoryView />}
        {activeTab === 'import'     && <ImportView />}
        {activeTab === 'settings'   && <SettingsView />}
      </div>

      <BottomNav />
      <SlidePanel />
    </>
  )
}
