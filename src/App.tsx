import { useEffect } from 'react'
import { useAppStore } from './stores/appStore'
import { useRealtimeStore } from './stores/realtimeStore'
import { initSyncEngine } from './lib/syncEngine'
import TopBar from './components/TopBar'
import BottomNav from './components/BottomNav'
import SlidePanel from './components/SlidePanel'
import ChecklistView from './components/ChecklistView'
import InventoryView from './components/InventoryView'
import ImportView from './components/ImportView'
import SettingsView from './components/SettingsView'
import './App.css'

export default function App() {
  const { activeTab, darkMode } = useAppStore()
  const { loadRFEList, subscribeToRFEList, unsubscribeAll } = useRealtimeStore()

  // Apply dark mode to <html> element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    // Initialize offline sync engine (registers online/offline listeners, replays queue)
    initSyncEngine()
    loadRFEList()
    subscribeToRFEList()
    return () => unsubscribeAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <TopBar />
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
