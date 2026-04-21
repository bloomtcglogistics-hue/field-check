# UX Critique — Checklist surface around displayPriority fix

Scoped observations from the Phase-3 pass while fixing `displayPriority.ts`. Not addressed in this commit; recorded for Billy to prioritise.

Primary target device: Samsung Galaxy Z Fold 7, both folded (narrow phone) and unfolded (small tablet). Secondary: iPad, laptop.

## a. Card rendering (spacing / hierarchy / density)

**Status:** NEEDS WORK
**Observation:** `ItemCard.tsx` applies font sizes inline (14 / 12 / 12 / 11) but the row spacing relies on default block margins — on Fold 7 folded, three-line cards stack too tight once the Size + Qty pill row appears, and the expand chevron crowds the primary title on narrow widths.
**Recommended fix:** move card typography into a dedicated CSS block (`.item-primary`, `.item-subtitle`, `.item-tertiary`) with a consistent 2–3 px vertical rhythm, and give the expand button `flex-shrink: 0` with a left margin so it never encroaches on the title column.

## b. Badge system (quantity duplication / status visibility)

**Status:** OK (post this commit) / NEEDS WORK (partial-found colouring)
**Observation:** The Qty badge only renders in the pills row now that the Scenario-4 title-fallback is fixed. PARTIAL and check-found states are distinguishable in light mode but the PARTIAL amber chip has low contrast against `--amber-light` card backgrounds in dark mode.
**Recommended fix:** bump the PARTIAL chip to `--amber-dark` background / white text in dark mode, and add a visible border on the card (not just background tint) so the partial state survives users with reduced-colour accessibility settings.

## c. Search behavior (full-text, sub-2s)

**Status:** OK
**Observation:** `ChecklistView.tsx:232` filters with `Object.values(it.data).some(v => v.toLowerCase().includes(q))` — every raw column is covered, including hidden-but-searchable identifiers. No column is excluded. Performance on typical list sizes (~1–2k rows) stays interactive because the filter is memoised on `searchQuery` + `filter` + `items` and the list is virtualised.
**Recommended fix:** none required. If list sizes grow past ~10k rows, consider debouncing `searchQuery` at the input (currently writes directly to the Zustand store on every keystroke).

## d. Grouping toggle (surfaces when categorical data present)

**Status:** OK
**Observation:** `FilterBar.tsx:42` shows the Group chip only when `groups.length > 0`, which is derived from the detected `grpName` column. PO # / location / vendor routes through `ctxNames`, not `grpName`, so the toggle won't appear for those even though the CLAUDE.md contract lists them as valid grouping dimensions.
**Recommended fix:** extend `ChecklistView.groups` to fall back to the first of `[grpName, location_header, vendor_header, po_number_header]` that has distinct values. Keep the existing behaviour as default.

## e. Reset button (confirmation dialog / destructive styling)

**Status:** OK
**Observation:** `SettingsView.tsx:147–200` — "Reset All Checks…" button is red (`#ef4444`), disabled on finalized lists, and opens an explicit confirm modal with "This cannot be undone." Meets the contract.
**Recommended fix:** none required. Minor: move the button onto the checklist header too (currently buried under Settings) so inspectors can reset without tab-switching.

## f. window.storage persistence (survives reload)

**Status:** OK
**Observation:** Check state persists via Supabase (`fc_check_state`) plus an offline IndexedDB mirror (`idb-keyval` via `src/lib/offlineStore.ts` + `offlineQueue.ts`). A page reload re-hydrates from Supabase first, then replays the offline queue. The contract item says "window.storage API" but the effective implementation is stronger — IDB + server.
**Recommended fix:** update `CLAUDE.md` (Phase 2 contract item 8) to reflect IDB-backed persistence rather than the `window.storage` language, so the contract matches the code of record.

## g. Auto-timestamp on check-off (user-visible?)

**Status:** OK
**Observation:** `ItemCard.tsx:386–390` renders `${checked_by} · ${month/day hour:min}` on checked cards. Timestamp is visible, not just internal.
**Recommended fix:** none required. Minor: show relative time ("2 min ago") on fresh checks and fall back to the absolute stamp after ~1 hour — reads more naturally on a live shift.

## h. Select All / Deselect All (present and functional)

**Status:** OK
**Observation:** `ChecklistView.tsx:438–452` wires both buttons through `selectAllFiltered(filteredIds, rfeId, true/false, userName)`, so the batch respects the active filter (Found / Missing / group). Backed by a dedicated store action with offline-queue fallback.
**Recommended fix:** none required. Minor: the buttons show an unbounded count — on filtered views with thousands of rows this invites "oops, did I mean all?" mistakes. Show a confirm when the count exceeds ~100, mirroring the Reset button pattern.
