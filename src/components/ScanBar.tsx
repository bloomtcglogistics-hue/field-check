import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import { ScanLine, X } from 'lucide-react'
import type { Item, DisplayConfig } from '../types'
import { getDisplayPriority } from '../lib/displayPriority'

interface Props {
  items: Item[]
  displayConfig: DisplayConfig | undefined
  onMatch: (itemId: string) => void
  onNoMatch: (code: string) => void
}

export interface ScanBarHandle {
  /** Submit a code from outside the input (used by the global keyboard-wedge listener). */
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
  const { idName, descName, aiFieldMap, qtyNames, scenario } = config
  let fieldMappings: Record<string, string>
  if (aiFieldMap && Object.keys(aiFieldMap).length > 0) {
    fieldMappings = { ...aiFieldMap }
  } else {
    fieldMappings = {}
    const idIsActuallyQty = idName && qtyNames.includes(idName)
    if (idName && idName !== descName && !idIsActuallyQty) {
      fieldMappings[idName] = 'tag_number'
    }
    if (descName) fieldMappings[descName] = 'description'
  }
  const display = getDisplayPriority(item.data, fieldMappings, {
    forbiddenHeaders: qtyNames,
    aiScenario: scenario,
  })
  return display.primary || display.secondary || item.id
}

function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern) } catch { /* unsupported */ }
}

const ScanBar = forwardRef<ScanBarHandle, Props>(function ScanBar(
  { items, displayConfig, onMatch, onNoMatch }: Props,
  handleRef,
) {
  const [value, setValue] = useState('')
  const [matches, setMatches] = useState<Item[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [liveMsg, setLiveMsg] = useState('')
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

  const submit = (rawCode: string) => {
    const code = rawCode.trim()
    if (!code) return
    const result = findMatches(items, code)

    if (result.items.length === 0) {
      vibrate([40, 60, 40])
      setLiveMsg(`No match for "${code}"`)
      onNoMatch(code)
      return
    }

    if (result.items.length === 1) {
      vibrate(15)
      setLiveMsg(`Match found — ${result.tier === 'exact' ? 'exact' : 'partial'}`)
      onMatch(result.items[0].id)
      setValue('')
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
      setValue(code)
      submit(code)
    },
    focus: () => inputRef.current?.focus(),
  // submit closes over items/config; recompute handle when they change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [items, displayConfig])

  const pick = (itemId: string) => {
    vibrate(15)
    onMatch(itemId)
    setValue('')
    setDropdownOpen(false)
    setMatches([])
    setLiveMsg('Item selected')
  }

  return (
    <div className="scan-section" ref={wrapRef}>
      <div className="scan-wrap">
        <ScanLine size={16} style={{ color: 'var(--green)', flexShrink: 0 }} aria-hidden="true" />
        <input
          ref={inputRef}
          className="scan-input"
          type="text"
          inputMode="text"
          placeholder="Scan barcode or paste item code..."
          aria-label="Scan or paste item code"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(value) }}
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

      {/* Live region — screen readers announce match/no-match without visual change */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveMsg}
      </div>
    </div>
  )
})

export default ScanBar
