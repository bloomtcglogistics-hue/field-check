import { useRef, useCallback, useMemo, useEffect, useState, memo, forwardRef } from 'react'
import { VariableSizeList as List } from 'react-window'
import type { ListChildComponentProps } from 'react-window'
import ItemCard from './ItemCard'
import type { Item, DisplayConfig } from '../types'

const DEFAULT_ITEM_HEIGHT = 72
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

/** Adds bottom padding so the last items aren't hidden behind the FAB. */
const InnerListElement = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function InnerListElement(props, ref) {
    return <div ref={ref} {...props} style={{ ...props.style, paddingBottom: 80 }} />
  }
)

/** Wrapper that observes its own height via ResizeObserver and reports changes. */
function MeasuredDiv({ index, onMeasure, children }: {
  index: number
  onMeasure: (index: number, height: number) => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const h = entries[0]?.borderBoxSize?.[0]?.blockSize ?? entries[0]?.contentRect.height
      if (h) onMeasure(index, h)
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
  return (
    <div style={style}>
      <MeasuredDiv index={index} onMeasure={data.setRowHeight}>
        <div style={{ padding: '3px 14px' }}>
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
  const sizeMap = useRef(new Map<number, number>())
  const resetQueued = useRef(false)
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

  // Reset size cache when entries change (filter / sort / search)
  useEffect(() => {
    sizeMap.current.clear()
    listRef.current?.resetAfterIndex(0)
  }, [entries])

  const getItemSize = useCallback((index: number): number => {
    return sizeMap.current.get(index) ??
      (entries[index]?.type === 'header' ? GROUP_HEADER_HEIGHT : DEFAULT_ITEM_HEIGHT)
  }, [entries])

  // Called by MeasuredDiv when an item's rendered height changes (expand/collapse).
  const setRowHeight = useCallback((index: number, height: number) => {
    const cur = sizeMap.current.get(index)
    if (cur !== undefined && Math.abs(cur - height) < 2) return
    sizeMap.current.set(index, height)
    if (!resetQueued.current) {
      resetQueued.current = true
      requestAnimationFrame(() => {
        resetQueued.current = false
        listRef.current?.resetAfterIndex(0, false)
      })
    }
  }, [])

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

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0 }}>
      {containerHeight > 0 && (
        <List
          ref={listRef}
          height={containerHeight}
          itemCount={entries.length}
          itemSize={getItemSize}
          itemData={itemData}
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
