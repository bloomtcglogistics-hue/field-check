import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ViewTab, FilterState } from '../types'

interface AppState {
  // Navigation
  activeTab: ViewTab
  setActiveTab: (tab: ViewTab) => void

  // Selected RFE
  currentRfeId: string | null
  setCurrentRfeId: (id: string | null) => void

  /** When set on the inventory tab, render ReadOnlyDetailView for this RFE
   *  instead of the card grid. Cleared on Back / Edit transitions. */
  inventoryDetailRfeId: string | null
  setInventoryDetailRfeId: (id: string | null) => void

  // User identity (persisted to localStorage)
  userName: string
  setUserName: (name: string) => void

  // Search
  searchQuery: string
  setSearchQuery: (q: string) => void

  // Filters / sort / grouping
  filter: FilterState
  setFilter: (f: Partial<FilterState>) => void
  resetFilter: () => void

  // Slide panels
  rightPanelOpen: boolean
  setRightPanelOpen: (open: boolean) => void

  // Dark mode (persisted)
  darkMode: boolean
  toggleDarkMode: () => void
}

const defaultFilter: FilterState = {
  group: null,
  statusFilter: 'all',
  sortMode: 'index',
  groupByEnabled: false,
  sortColumn: null,
  sortDir: 'asc',
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeTab: 'inventory',
      setActiveTab: (tab) => set({ activeTab: tab }),

      currentRfeId: null,
      setCurrentRfeId: (id) => set({ currentRfeId: id }),

      inventoryDetailRfeId: null,
      setInventoryDetailRfeId: (id) => set({ inventoryDetailRfeId: id }),

      userName: '',
      setUserName: (name) => set({ userName: name.trim() }),

      searchQuery: '',
      setSearchQuery: (q) => set({ searchQuery: q }),

      filter: defaultFilter,
      setFilter: (f) => set(state => ({ filter: { ...state.filter, ...f } })),
      resetFilter: () => set({ filter: defaultFilter, searchQuery: '' }),

      rightPanelOpen: false,
      setRightPanelOpen: (open) => set({ rightPanelOpen: open }),

      darkMode: false,
      toggleDarkMode: () => set(state => ({ darkMode: !state.darkMode })),
    }),
    {
      name: 'fieldcheck-app-v3',
      partialize: (state) => ({ userName: state.userName, darkMode: state.darkMode }),
    }
  )
)
