# FieldCheck — Vite + React + Supabase Redesign
**Date:** 2026-04-13  
**Status:** Approved

## Overview

Refactor TCG Field Check from a single-file Firebase PWA into a production-grade Vite + React + TypeScript app backed by Supabase. Replace Firebase Realtime Database with Supabase real-time subscriptions. Add a `/parse-equipment-list` endpoint to the existing Railway FastAPI backend for AI-powered CSV/XLSX/PDF column detection via OpenRouter Gemini.

## Decisions

- **Frontend:** Vite + React 18 + TypeScript
- **State:** Zustand (two stores: app state + realtime data)
- **Database:** Supabase (PostgreSQL + Realtime)
- **Deployment:** Vercel (frontend), Railway (backend — unchanged)
- **Auth:** None — user name in localStorage (field crew, no passwords)
- **Migration:** Fresh start — no Firebase data migration
- **File parsing:** SheetJS client-side for CSV/XLSX; PDF via backend

## Project Structure

```
fieldcheck/
├── src/
│   ├── types/index.ts
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── columnDetection.ts
│   │   ├── fileParser.ts
│   │   └── exportReport.ts
│   ├── store/
│   │   ├── appStore.ts
│   │   └── realtimeStore.ts
│   ├── components/
│   │   ├── layout/
│   │   │   ├── TopBar.tsx
│   │   │   ├── BottomNav.tsx
│   │   │   └── SlidePanel.tsx
│   │   ├── checklist/
│   │   │   ├── ChecklistView.tsx
│   │   │   ├── ItemCard.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   └── FilterBar.tsx
│   │   ├── inventory/
│   │   │   ├── InventoryView.tsx
│   │   │   └── RFECard.tsx
│   │   ├── import/
│   │   │   ├── ImportView.tsx
│   │   │   └── ColumnPreview.tsx
│   │   └── settings/
│   │       └── SettingsView.tsx
│   ├── App.tsx
│   └── main.tsx
├── public/
│   ├── manifest.json
│   └── sw.js
├── index.html
├── vite.config.ts
├── vercel.json
└── tsconfig.json
```

## Supabase Schema

```sql
create table rfe_lists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  file_name   text not null,
  item_count  int not null default 0,
  created_at  timestamptz default now()
);

create table rfe_configs (
  rfe_id      uuid primary key references rfe_lists(id) on delete cascade,
  headers     text[] not null,
  desc_name   text,
  id_name     text,
  ctx_names   text[] default '{}',
  qty_names   text[] default '{}',
  grp_name    text
);

create table rfe_items (
  id          uuid primary key default gen_random_uuid(),
  rfe_id      uuid not null references rfe_lists(id) on delete cascade,
  item_index  int not null,
  data        jsonb not null
);

create table rfe_state (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references rfe_items(id) on delete cascade,
  rfe_id      uuid not null references rfe_lists(id) on delete cascade,
  checked     boolean default false,
  note        text default '',
  updated_at  timestamptz default now(),
  updated_by  text default ''
);

create index on rfe_items(rfe_id, item_index);
create index on rfe_state(rfe_id);
create index on rfe_state(item_id);
```

Supabase Realtime enabled on `rfe_state` only (the hot table for cross-device sync).

## Data Flow

### Import
1. User picks file → `fileParser.ts` (SheetJS) → raw row arrays
2. `columnDetection.ts` score-based mapping → suggested config
3. User optionally uses `/parse-equipment-list` (AI) for better detection
4. User confirms → bulk INSERT `rfe_items` + INSERT `rfe_configs` + INSERT `rfe_lists`
5. Bulk INSERT `rfe_state` rows (all `checked=false`)

### Checklist / Real-time Sync
1. User selects RFE → `realtimeStore.loadRFE(rfeId)`
2. SELECT `rfe_items` JOIN `rfe_state` for the RFE
3. `supabase.channel('rfe_state').on('postgres_changes', ...)` subscribes
4. Any UPDATE on `rfe_state` pushes a patch into Zustand state
5. Only the changed `ItemCard` re-renders (Zustand selector per item)
6. `realtimeStore.unloadRFE()` removes subscription when leaving the view

### Check-off
1. User taps item → optimistic update in Zustand (instant local UI)
2. UPSERT `rfe_state` `{ checked, updated_by, updated_at }`
3. Supabase broadcasts change to all subscribed devices
4. Other devices' `realtimeStore` receives the change and patches state
5. On UPSERT failure → revert optimistic update + show error toast

## State Management

### `appStore` (Zustand)
- `activeView`: `'checklist' | 'inventory' | 'import' | 'settings'`
- `activeRfeId`: `string | null`
- `userName`: `string` (persisted in localStorage)
- `searchQuery`: `string`
- `filterGroup`: `string | null`
- `filterStatus`: `'all' | 'found' | 'missing'`
- `sortMode`: `'index' | 'alpha' | 'status'`
- `groupByEnabled`: `boolean`
- `menuOpen`: `boolean`
- `settingsOpen`: `boolean`

### `realtimeStore` (Zustand)
- `items`: `RfeItem[]`
- `state`: `Record<itemId, RfeStateRow>`
- `config`: `RfeConfig | null`
- `rfeList`: `RfeList[]`
- `loading`: `boolean`
- `subscription`: Supabase channel reference
- Actions: `loadRFE`, `unloadRFE`, `toggleCheck`, `updateNote`, `loadInventory`, `deleteRFE`, `resetChecks`, `importRFE`

## UI

Preserves FieldFlow aesthetic exactly:
- DM Sans font, white bg (#f8fafc), green accent (#16a34a)
- Green gradient TopBar, card-based ItemCard, bottom 4-tab BottomNav
- Orange dot = unchecked, green dot = checked
- Slide-out panels for Menu (left) and Settings (right)
- All 44px minimum touch targets for field use

All CSS converted from inline `<style>` to a single `src/styles/globals.css` keeping every variable and class name intact — zero visual regression.

## `/parse-equipment-list` Backend Endpoint

**Repo:** `bloomtcglogistics-hue/danieli-ocr-backend` (FastAPI, Python)

**Route:** `POST /parse-equipment-list`

**Input:** `multipart/form-data` with `file` field (CSV, XLSX, or PDF)

**Processing:**
- CSV/XLSX: parsed with `pandas`, first 10 rows extracted
- PDF: text extracted with `pdfplumber`, Gemini reconstructs table structure

**Output:**
```json
{
  "headers": ["IC Number", "Cat Class Description", "Make", "..."],
  "desc_name": "Cat Class Description",
  "id_name": "IC Number",
  "ctx_names": ["Make", "Model", "Serial Number"],
  "qty_names": [],
  "grp_name": "Category",
  "preview_rows": [{}, {}, {}, {}, {}],
  "confidence": "high"
}
```

**Gemini prompt:** Structured system prompt with column role scoring rules from the brief. Response is JSON-schema-constrained so no regex parsing needed.

**Uses existing:** OpenRouter key + `google/gemini-2.0-flash-001` model already configured in the app.

## Deployment

- **Frontend:** Vercel — `vercel.json` rewrites all routes to `index.html` for SPA routing. Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **Backend:** Railway — existing deployment, new endpoint added to existing FastAPI app.

## Known Bugs Fixed by This Rewrite

1. **"—" display bug** — item keys and display config names now use identical sanitization (snake_case) applied once at import time and stored consistently in JSONB.
2. **Index-based display** — eliminated entirely; all config uses column name strings.
3. **Settings panel** — placeholder items remain (out of scope), but structure is clean for future implementation.
