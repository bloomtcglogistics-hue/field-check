import { useState, useRef, useEffect } from 'react'
import { ScanLine, X } from 'lucide-react'
import type { Item, DisplayConfig } from '../types'
import { getDisplayPriority } from '../lib/displayPriority'

interface Props {
  items: Item[]
  displayConfig: DisplayConfig | undefined
  onMatch: (itemId: string) => void
  onNoMatch: (code: string) => void
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

export default function ScanBar({ items, displayConfig, onMatch, onNoMatch }: Props) {
  const [value, setValue] = useState('')
  const [matches, setMatches] = useState<Item[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

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

  const handleSubmit = () => {
    const code = value.trim()
    if (!code) return
    const result = findMatches(items, code)

    if (result.items.length === 0) {
      onNoMatch(code)
      return
    }

    if (result.items.length === 1) {
      onMatch(result.items[0].id)
      setValue('')
      setDropdownOpen(false)
      setMatches([])
      return
    }

    setMatches(result.items.slice(0, 20))
    setDropdownOpen(true)
  }

  const pick = (itemId: string) => {
    onMatch(itemId)
    setValue('')
    setDropdownOpen(false)
    setMatches([])
  }

  return (
    <div className="scan-section" ref={wrapRef}>
      <div className="scan-wrap">
        <ScanLine size={16} style={{ color: 'var(--green)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          className="scan-input"
          type="text"
          inputMode="text"
          placeholder="Scan barcode or paste item code..."
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {value && (
          <button
            className="scan-clear-btn"
            onClick={() => { setValue(''); setDropdownOpen(false); inputRef.current?.focus() }}
            aria-label="Clear scan input"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {dropdownOpen && matches.length > 0 && (
        <div className="scan-dropdown">
          <div className="scan-dropdown-head">
            {matches.length} match{matches.length === 1 ? '' : 'es'} — pick one
          </div>
          {matches.map(m => (
            <button key={m.id} className="scan-dropdown-item" onClick={() => pick(m.id)}>
              {primaryTitleFor(m, displayConfig)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
