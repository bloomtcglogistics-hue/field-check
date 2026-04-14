import { useAppStore } from '../stores/appStore'
import type { SortMode } from '../types'

interface Props {
  groups: string[]
}

export default function FilterBar({ groups }: Props) {
  const { filter, setFilter } = useAppStore()

  return (
    <div className="filter-bar">
      {/* Status filter */}
      <button
        className={`filter-chip${filter.statusFilter === 'all' ? ' active' : ''}`}
        onClick={() => setFilter({ statusFilter: 'all' })}
      >All</button>
      <button
        className={`filter-chip${filter.statusFilter === 'checked' ? ' active' : ''}`}
        onClick={() => setFilter({ statusFilter: 'checked' })}
      >Found</button>
      <button
        className={`filter-chip${filter.statusFilter === 'unchecked' ? ' active' : ''}`}
        onClick={() => setFilter({ statusFilter: 'unchecked' })}
      >Missing</button>

      <div className="filter-divider" />

      {/* Sort */}
      {(['index', 'alpha', 'status'] as SortMode[]).map(mode => {
        const labels: Record<SortMode, string> = { index: '#', alpha: 'A–Z', status: 'Status' }
        return (
          <button
            key={mode}
            className={`filter-chip${filter.sortMode === mode ? ' active' : ''}`}
            onClick={() => setFilter({ sortMode: mode })}
          >{labels[mode]}</button>
        )
      })}

      {/* Group toggle — only show if a group column exists */}
      {groups.length > 0 && (
        <>
          <div className="filter-divider" />
          <button
            className={`filter-chip${filter.groupByEnabled ? ' active' : ''}`}
            onClick={() => setFilter({ groupByEnabled: !filter.groupByEnabled, group: null })}
          >
            Group
          </button>
        </>
      )}

      {/* Group filter pills */}
      {filter.groupByEnabled && groups.map(g => (
        <button
          key={g}
          className={`filter-chip${filter.group === g ? ' active' : ''}`}
          onClick={() => setFilter({ group: filter.group === g ? null : g })}
        >{g || '—'}</button>
      ))}
    </div>
  )
}
