# CLAUDE.md — field-check (CheckFlow frontend)

You are the Builder for CheckFlow. Read this file fully before any action. The full knowledge base lives in Billy's Claude Project (Architect); this file is the scoped rule set for work inside this repo.

## Stack

- React 18 + TypeScript
- Vite
- Zustand (state)
- Deployed to Vercel → `fieldcheck-sooty.vercel.app`
- Backend: `https://web-production-65679.up.railway.app` (CheckFlow backend, NOT FieldFlow's)
- Database: Supabase project `kwxbffetryaoxgycyehg.supabase.co`, tables `fc_rfe_index`, `fc_items`, `fc_check_state`

## Workflow rules — non-negotiable

1. `pwd` before every `git push`. Billy runs multiple parallel Termux sessions; wrong-dir pushes happen.
2. `git pull` before starting any work. Multi-device sync is the default.
3. Every session opens with `pwd && git pull` before any other command.
4. All commits on a feature branch, never directly to `main`.
5. After changes, run `npm run build` and fix every TypeScript error before declaring done.
6. Output a diff at the end of the session so the Reviewer agent can review it in a separate checkout.
7. Primary target device: Samsung Galaxy Z Fold 7 (test folded narrow-phone AND unfolded small-tablet layouts). Secondary: iPad, Windows laptop.
8. Touch targets ≥44px. Single-column collapse on small screens.

## Checklist UI contract (from 06_PIPELINE_CONTRACT.md Phase 2)

These features are a contract. Do NOT ship a change that silently violates any of them. If a change must violate one, call it out explicitly in the commit message and flag it to Billy.

- Full-text search across all columns
- Per-row checkbox with found / not-found visual state
- Partial quantity entry when qty > 1
- Live progress counter (items and total pieces)
- Column sorting via header click
- Grouping toggle when categorical data exists (PO #, location, vendor)
- Per-row notes / comments
- Persistent state via `window.storage` API (survives session close)
- Reset button with confirmation dialog
- Auto-timestamp on check-off
- Mobile-responsive, ≥44px touch targets, single-column collapse on small screens
- Dark / light mode toggle
- Select All / Deselect All batch controls

## Display priority rule (enforced in displayPriority.ts)

When picking the primary display field for a row, the chain is:

1. `Tag`
2. `Item Code`
3. `Label`
4. `Description`

**`quantity`, `unit`, `size`, `cost`, `weight` are NEVER valid as primary display field.** If no identifier exists, fall through to `description`. Backend returns a Scenario 4 response when no identifier is present — honor it.

## Context fallback chain (grouping / filtering)

`location` → `vendor` → `category` → `po_number`

## Active bug

`displayPriority.ts` — Scenario 4 regression. Backend returns correct Scenario 4; frontend ignores it and picks quantity as primary, producing cards titled with a quantity number and a duplicated "Qty: N" badge. Fix by enforcing the rule above.

## Environment variables (Vercel)

- `VITE_CHECKFLOW_BACKEND_URL` → `https://web-production-65679.up.railway.app`
- `VITE_CHECKFLOW_SHARED_SECRET` → the `X-CheckFlow-Secret` value

When adding a new env var, update `04_STACK_AND_INFRA.md` in the Claude Project in the same PR.

## Do NOT

- Do NOT suggest or re-introduce Firebase. The migration off Firebase is complete.
- Do NOT point CheckFlow at `web-production-69f23`. That is the FieldFlow backend. CheckFlow is on `web-production-65679`.
- Do NOT add new runtime dependencies without flagging to Billy first. Bundle size and supply-chain surface are real costs.
- Do NOT edit files under `src/components/ui/` manually. Those are shadcn primitives — customization happens in consumer components.
- Do NOT assume the parser is Danieli-only. The product must handle any industrial vendor. Vendor detection is dynamic, never hardcoded.
- Do NOT suggest merging CheckFlow into FieldFlow. That decision is deferred until CheckFlow is stable across a full project cycle.
- Do NOT architect for multi-tenant / external customers yet. Pre-pitch checklist items 1–7 in the Claude Project must be green first.

## Prompt style Billy expects

- Massive single prompts, 10–15 minute execution blocks.
- No incremental permission-asking. Approve all design decisions upfront.
- Claude Code prompts delivered in copy blocks.
- Lead with what was done, not what is about to be done.
- Brief. Action-oriented.

## Pointer

For anything not covered here — vendor patterns, pitch-readiness gating, agent roles, full roadmap — refer Billy back to the Claude Project knowledge files:

- `00_WHAT_IM_BUILDING.md`
- `01_PRE_PITCH_CHECKLIST.md`
- `02_AGENT_ROLES.md`
- `03_WORKFLOW_RULES.md`
- `04_STACK_AND_INFRA.md`
- `05_VENDOR_PATTERNS.md`
- `06_PIPELINE_CONTRACT.md`
