import { Search, X } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useCallback, useRef } from 'react'

export default function SearchBar() {
  const { searchQuery, setSearchQuery } = useAppStore()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value),
    [setSearchQuery]
  )

  const clear = () => {
    setSearchQuery('')
    inputRef.current?.focus()
  }

  return (
    <div className="search-section">
      <div className="search-wrap">
        <Search size={16} style={{ color: 'var(--text3)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="search"
          placeholder="Search items…"
          value={searchQuery}
          onChange={handleChange}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {searchQuery && (
          <button onClick={clear} style={{ color: 'var(--text3)', display: 'flex', alignItems: 'center' }}>
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
