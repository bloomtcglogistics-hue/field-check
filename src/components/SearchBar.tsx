import { Search, X, Hash, Type } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useCallback, useRef, useState, useEffect } from 'react'

interface Props {
  resultCount?: number
  totalCount?: number
}

export default function SearchBar({ resultCount, totalCount }: Props) {
  const { searchQuery, setSearchQuery } = useAppStore()
  const [localValue, setLocalValue] = useState(searchQuery)
  const [numericMode, setNumericMode] = useState(false)
  const lastStoreVal = useRef(searchQuery)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync from store when it resets externally
  useEffect(() => {
    if (searchQuery !== lastStoreVal.current) {
      lastStoreVal.current = searchQuery
      setLocalValue(searchQuery)
    }
  }, [searchQuery])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setLocalValue(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      lastStoreVal.current = val
      setSearchQuery(val)
    }, 150)
  }, [setSearchQuery])

  const clear = () => {
    setLocalValue('')
    lastStoreVal.current = ''
    setSearchQuery('')
    inputRef.current?.focus()
  }

  const showCount = totalCount !== undefined && resultCount !== undefined

  return (
    <div className="search-section">
      <div className="search-row">
        <div className="search-wrap">
          <Search size={15} style={{ color: 'var(--text3)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="search"
            inputMode={numericMode ? 'numeric' : 'text'}
            placeholder="Search items…"
            value={localValue}
            onChange={handleChange}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {localValue && (
            <button onClick={clear} className="search-clear-btn" aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>

        {/* ABC ↔ 123 toggle */}
        <button
          className={`keyboard-toggle${numericMode ? ' active' : ''}`}
          onClick={() => setNumericMode(m => !m)}
          aria-label={numericMode ? 'Switch to text keyboard' : 'Switch to numeric keyboard'}
          title={numericMode ? 'ABC keyboard' : '123 keyboard'}
        >
          {numericMode ? <Type size={15} /> : <Hash size={15} />}
        </button>
      </div>

      {showCount && (
        <div className="search-count">
          {localValue
            ? `Showing ${resultCount} of ${totalCount} items`
            : `${totalCount} item${totalCount !== 1 ? 's' : ''}`}
        </div>
      )}
    </div>
  )
}
