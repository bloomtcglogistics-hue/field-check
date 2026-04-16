import { useRef, useCallback, useMemo, useEffect, useState, memo, forwardRef } from 'react'
import { VariableSizeList as List } from 'react-window'
import type { ListChildComponentProps } from 'react-window'
import ItemCard from './ItemCard'
import type { Item, DisplayConfig } from '../types'

const DEFAULT_ITEM_HEIGHT = 80
const GROUP_HEADER_HEIGHT = 36

type FlatEntry =
  | { type: 'header'; group: string }
  | { type: 'item'; item: Item }

interface ItemData {
  entries: FlatEntry[]
  displayConfig: DisplayConfig
  searchQuery: string
  onNeedName: () => void
  pendingItemIds: Set<string>
  conflictItemIds: Set<string>
  scanHighlightId: string | null
  scanRevision: number
  setRowHeight: (index: number, height: number) => void
}

interface Props {
  grouped: { group: string | null; items: Item[] }[]
  displayConfig: DisplayConfig
  searchQuery: string
  onNeedName: () => void
  pendingItemIds: Set<string>
  conflictItemIds: Set<string>
  scanHighlightId: string | null
  scanRevision: number
}

/** Stable key for a flat entry — item.id for items, `header:{group}` for headers.
 *  Used for both react-window's `itemKey` (component identity) and our own
 *  height cache (so heights survive list reordering). */
function keyForEntry(entry: FlatEntry | undefined): string | null {
  if (!entry) return null
  return entry.type === 'header' ? `header:${entry.group}` : entry.item.id
}

/** Bottom padding keeps the last items above the single speed-dial FAB.
 *  Trigger is a 52px circle sitting at `bottom: nav-h (64) + 16 = 80px` from
 *  the viewport, so its top edge lives 132px from the bottom. We pad 300px
 *  for a generous gutter so the last item's expand chevron is always
 *  tappable, even when the speed-dial menu is open or the bottom nav
 *  briefly shifts. The speed-dial menu pops UPWARD from the trigger and
 *  overlays scroll content on purpose; users have already scrolled to the
 *  end by then. */
const InnerListElement = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function InnerListElement(props, ref) {
    return <div ref={ref} {...props} style={{ ...props.style, paddingBottom: 300 }} />
  }
)

/** Wrapper that observes its own height via ResizeObserver and reports changes.
 *  CRITICAL: no pixel dampener. Every height change must propagate to the
 *  parent so react-window can re-lay out subsequent rows. Sub-pixel drift
 *  accumulating without reflow is exactly what produces the visible overlap. */
function MeasuredDiv({ index, onMeasure, children }: {
  index: number
  onMeasure: (index: number, height: number) => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Synchronous initial measurement — primes the cache before the next
    // ResizeObserver tick fires, so first paint after mount is correct.
    const initial = el.getBoundingClientRect().height
    if (initial > 0) onMeasure(index, initial)
    const ro = new ResizeObserver(entries => {
      const h = entries[0]?.borderBoxSize?.[0]?.blockSize ?? entries[0]?.contentRect.height
      if (h && h > 0) onMeasure(index, h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [index, onMeasure])
  return <div ref={ref}>{children}</div>
}

/** A single row inside the virtual list — either a group header or an ItemCard. */
const Row = memo(function Row({ index, style, data }: ListChildComponentProps<ItemData>) {
  const entry = data.entries[index]
  if (!entry) return null

  if (entry.type === 'header') {
    return (
      <div style={style}>
        <MeasuredDiv index={index} onMeasure={data.setRowHeight}>
          <div className="group-header" style={{ padding: '12px 14px 4px' }}>
            {entry.group}
          </div>
        </MeasuredDiv>
      </div>
    )
  }

  const { item } = entry
  // 4px top/bottom padding => 8px visible gap between adjacent cards.
  // Prevents the expand arrow on one card from butting against the next.
  return (
    <div style={style}>
      <MeasuredDiv index={index} onMeasure={data.setRowHeight}>
        <div style={{ padding: '4px 14px' }}>
          <ItemCard
            item={item}
            displayConfig={data.displayConfig}
            searchQuery={data.searchQuery}
            onNeedName={data.onNeedName}
            hasPendingMutation={data.pendingItemIds.has(item.id)}
            hasConflict={data.conflictItemIds.has(item.id)}
            scanHighlight={data.scanHighlightId === item.id}
            scanRevision={data.scanRevision}
          />
        </div>
      </MeasuredDiv>
    </div>
  )
})

export default function VirtualItemList({
  grouped, displayConfig, searchQuery, onNeedName,
  pendingItemIds, conflictItemIds, scanHighlightId, scanRevision,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<List>(null)
  // Height cache keyed by STABLE id (item.id or `header:{group}`), NOT by index.
  // Index-keyed caches go stale the moment the list reorders (filter, sort,
  // status change) and become the root cause of overlap during sort flips.
  const sizeById = useRef(new Map<string, number>())
  // Coalesce multiple in-frame measurements into a single resetAfterIndex call,
  // starting from the SMALLEST changed index — anything before that is unchanged.
  const pendingResetIdx = useRef<number | null>(null)
  const flushScheduled = useRef(false)
  const [containerHeight, setContainerHeight] = useState(0)

  // Flatten grouped data into a single list of entries
  const entries = useMemo((): FlatEntry[] => {
    const flat: FlatEntry[] = []
    for (const { group, items } of grouped) {
      if (group) flat.push({ type: 'header', group })
      for (const item of items) flat.push({ type: 'item', item })
    }
    return flat
  }, [grouped])

  // Measure the container to give react-window a pixel height
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const h = entries[0]?.contentRect.height ?? 0
      if (h > 0) setContainerHeight(h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // When entries reorder, react-window's INTERNAL size cache is keyed by
  // index — so index 5 still holds the height of the previous item that
  // happened to live there. Reset from 0 forces it to re-ask getItemSize
  // for every row, which then reads our id-keyed sizeById map.
  useEffect(() => {
    listRef.current?.resetAfterIndex(0, true)
  }, [entries])

  const getItemSize = useCallback((index: number): number => {
    const entry = entries[index]
    if (!entry) return DEFAULT_ITEM_HEIGHT
    const key = keyForEntry(entry)!
    const cached = sizeById.current.get(key)
    if (cached !== undefined) return cached
    return entry.type === 'header' ? GROUP_HEADER_HEIGHT : DEFAULT_ITEM_HEIGHT
  }, [entries])

  // Called by MeasuredDiv every time a row's rendered height changes
  // (mount, expand/collapse, check/uncheck, qty entry, note autosize, etc.).
  //
  // No dampener — even fractional pixel changes get propagated. The exact-
  // equality early-exit prevents render loops without suppressing legitimate
  // changes. Multiple measurements in the same frame coalesce into one
  // resetAfterIndex call from the smallest changed index for efficiency.
  const setRowHeight = useCallback((index: number, height: number) => {
    const entry = entries[index]
    if (!entry) return
    const key = keyForEntry(entry)!
    const cur = sizeById.current.get(key)
    if (cur === height) return
    sizeById.current.set(key, height)

    if (pendingResetIdx.current === null || index < pendingResetIdx.current) {
      pendingResetIdx.current = index
    }
    if (!flushScheduled.current) {
      flushScheduled.current = true
      requestAnimationFrame(() => {
        flushScheduled.current = false
        const startIdx = pendingResetIdx.current ?? 0
        pendingResetIdx.current = null
        // shouldForceUpdate=true (default) is REQUIRED — without it, react-window
        // updates its internal size cache but never re-runs layout, so absolutely-
        // positioned rows below the resized one keep their stale `top` values
        // and visibly overlap.
        listRef.current?.resetAfterIndex(startIdx, true)
      })
    }
  }, [entries])

  // Scroll to scan-highlighted item
  useEffect(() => {
    if (!scanHighlightId) return
    const idx = entries.findIndex(e => e.type === 'item' && e.item.id === scanHighlightId)
    if (idx !== -1) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToItem(idx, 'center')
      })
    }
  }, [scanHighlightId, scanRevision, entries])

  const itemData = useMemo((): ItemData => ({
    entries, displayConfig, searchQuery, onNeedName,
    pendingItemIds, conflictItemIds, scanHighlightId, scanRevision,
    setRowHeight,
  }), [entries, displayConfig, searchQuery, onNeedName,
    pendingItemIds, conflictItemIds, scanHighlightId, scanRevision,
    setRowHeight])

  // Stable React key per row — without this, react-window keys by index and
  // recycles the same Row instance for a different item when the order changes,
  // briefly mismatching ItemCard state with the new item before measurement
  // catches up.
  const itemKey = useCallback((index: number, data: ItemData): string => {
    return keyForEntry(data.entries[index]) ?? `idx:${index}`
  }, [])

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0 }}>
      {containerHeight > 0 && (
        <List
          ref={listRef}
          height={containerHeight}
          itemCount={entries.length}
          itemSize={getItemSize}
          itemData={itemData}
          itemKey={itemKey}
          width="100%"
          overscanCount={5}
          innerElementType={InnerListElement}
        >
          {Row}
        </List>
      )}
    </div>
  )
}
