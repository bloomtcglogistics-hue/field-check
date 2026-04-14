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
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  setLeftPanelOpen: (open: boolean) => void
  setRightPanelOpen: (open: boolean) => void
}

const defaultFilter: FilterState = {
  group: null,
  statusFilter: 'all',
  sortMode: 'index',
  groupByEnabled: false,
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeTab: 'inventory',
      setActiveTab: (tab) => set({ activeTab: tab }),

      currentRfeId: null,
      setCurrentRfeId: (id) => set({ currentRfeId: id }),

      userName: '',
      setUserName: (name) => set({ userName: name.trim() }),

      searchQuery: '',
      setSearchQuery: (q) => set({ searchQuery: q }),

      filter: defaultFilter,
      setFilter: (f) => set(state => ({ filter: { ...state.filter, ...f } })),
      resetFilter: () => set({ filter: defaultFilter, searchQuery: '' }),

      leftPanelOpen: false,
      rightPanelOpen: false,
      setLeftPanelOpen: (open) => set({ leftPanelOpen: open, rightPanelOpen: false }),
      setRightPanelOpen: (open) => set({ rightPanelOpen: open, leftPanelOpen: false }),
    }),
    {
      name: 'fieldcheck-app-v2',
      // Only persist user identity — UI state resets on reload
      partialize: (state) => ({ userName: state.userName }),
    }
  )
)
