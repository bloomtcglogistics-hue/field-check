import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import { ScanLine, X, SlidersHorizontal } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import type { Item, DisplayConfig } from '../types'
import { getDisplayPriority } from '../lib/displayPriority'

interface Props {
  items: Item[]
  displayConfig: DisplayConfig | undefined
  onScanMatch: (itemId: string) => void
  onScanNoMatch: (code: string) => void
  filtersOpen: boolean
  onToggleFilters: () => void
  resultCount?: number
  totalCount?: number
}

export interface SearchScanBarHandle {
  submitCode: (code: string) => void
  focus: () => void
}

interface MatchResult {
  items: Item[]
  tier: 'exact' | 'partial'
}

function findMatches(items: Item[], rawCode: string): MatchResult {
  const q = rawCode.trim().toLowerCase()
  if (!q) return { items: [], tier: 'partial' }
  const exact: Item[] = []
  const partial: Item[] = []
  for (const item of items) {
    let hasExact = false
    let hasPartial = false
    for (const val of Object.values(item.data)) {
      if (!val) continue
      const lv = val.toLowerCase()
      if (lv === q) { hasExact = true; break }
      if (lv.includes(q)) hasPartial = true
    }
    if (hasExact) exact.push(item)
    else if (hasPartial) partial.push(item)
  }
  if (exact.length > 0) return { items: exact, tier: 'exact' }
  return { items: partial, tier: 'partial' }
}

function primaryTitleFor(item: Item, config: DisplayConfig | undefined): string {
  if (!config) return item.id
  const { idName, descName, aiFieldMap } = config
  let fieldMappings: Record<string, string>
  if (aiFieldMap && Object.keys(aiFieldMap).length > 0) {
    fieldMappings = { ...aiFieldMap }
  } else {
    fieldMappings = {}
    if (idName && idName !== descName) fieldMappings[idName] = 'tag_number'
    if (descName) fieldMappings[descName] = 'description'
  }
  const display = getDisplayPriority(item.data, fieldMappings)
  return display.primary || display.secondary || item.id
}

function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern) } catch { /* unsupported */ }
}

const SearchScanBar = forwardRef<SearchScanBarHandle, Props>(function SearchScanBar(
  { items, displayConfig, onScanMatch, onScanNoMatch, filtersOpen, onToggleFilters, resultCount, totalCount }: Props,
  handleRef,
) {
  const { searchQuery, setSearchQuery } = useAppStore()
  const [localValue, setLocalValue] = useState(searchQuery)
  const [matches, setMatches] = useState<Item[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [liveMsg, setLiveMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const lastStoreVal = useRef(searchQuery)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync from store when it resets externally
  useEffect(() => {
    if (searchQuery !== lastStoreVal.current) {
      lastStoreVal.current = searchQuery
      setLocalValue(searchQuery)
    }
  }, [searchQuery])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setLocalValue(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      lastStoreVal.current = val
      setSearchQuery(val)
    }, 150)
  }, [setSearchQuery])

  const clearAll = () => {
    setLocalValue('')
    lastStoreVal.current = ''
    setSearchQuery('')
    setDropdownOpen(false)
    setMatches([])
    inputRef.current?.focus()
  }

  const submit = (rawCode: string) => {
    const code = rawCode.trim()
    if (!code) return
    const result = findMatches(items, code)

    if (result.items.length === 0) {
      vibrate([40, 60, 40])
      setLiveMsg(`No match for "${code}"`)
      onScanNoMatch(code)
      return
    }

    if (result.items.length === 1) {
      vibrate(15)
      setLiveMsg(`Match found — ${result.tier === 'exact' ? 'exact' : 'partial'}`)
      onScanMatch(result.items[0].id)
      // Clear input + search so the matched card is visible in the full list
      setLocalValue('')
      lastStoreVal.current = ''
      setSearchQuery('')
      setDropdownOpen(false)
      setMatches([])
      return
    }

    vibrate(10)
    setLiveMsg(`${result.items.length} possible matches`)
    setMatches(result.items.slice(0, 20))
    setDropdownOpen(true)
  }

  useImperativeHandle(handleRef, () => ({
    submitCode: (code: string) => {
      setLocalValue(code)
      submit(code)
    },
    focus: () => inputRef.current?.focus(),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [items, displayConfig])

  const pick = (itemId: string) => {
    vibrate(15)
    onScanMatch(itemId)
    setLocalValue('')
    lastStoreVal.current = ''
    setSearchQuery('')
    setDropdownOpen(false)
    setMatches([])
    setLiveMsg('Item selected')
  }

  const showCount = totalCount !== undefined && resultCount !== undefined && localValue.trim().length > 0

  return (
    <div className="search-scan-section" ref={wrapRef}>
      <div className="search-scan-row">
        <div className="search-scan-wrap">
          <ScanLine size={16} style={{ color: 'var(--green)', flexShrink: 0 }} aria-hidden="true" />
          <input
            ref={inputRef}
            className="search-scan-input"
            type="search"
            inputMode="text"
            placeholder="Search or scan…"
            aria-label="Search items or scan barcode. Press Enter to scan."
            value={localValue}
            onChange={handleChange}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(localValue) } }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {localValue && (
            <button
              className="search-scan-clear"
              onClick={clearAll}
              aria-label="Clear"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          className={`filter-toggle-btn${filtersOpen ? ' active' : ''}`}
          onClick={onToggleFilters}
          aria-label={filtersOpen ? 'Hide filters and sort' : 'Show filters and sort'}
          aria-expanded={filtersOpen}
          title="Filters & sort"
        >
          <SlidersHorizontal size={16} />
        </button>
      </div>

      {showCount && (
        <div className="search-scan-count">
          {resultCount} of {totalCount} match
        </div>
      )}

      {dropdownOpen && matches.length > 0 && (
        <div className="scan-dropdown" role="listbox" aria-label="Matching items">
          <div className="scan-dropdown-head">
            {matches.length} match{matches.length === 1 ? '' : 'es'} — pick one
          </div>
          {matches.map(m => (
            <button
              key={m.id}
              role="option"
              aria-selected="false"
              className="scan-dropdown-item"
              onClick={() => pick(m.id)}
            >
              {primaryTitleFor(m, displayConfig)}
            </button>
          ))}
        </div>
      )}

      {/* Live region — announce scan outcomes to screen readers */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveMsg}
      </div>
    </div>
  )
})

export default SearchScanBar
