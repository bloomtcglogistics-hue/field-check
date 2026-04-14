-- ============================================================
-- TCG Field Check — Supabase Migration
-- Paste this entire file into: Supabase SQL Editor → Run
-- ============================================================

-- Enable UUID extension (usually already enabled on Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Table: fc_rfe_index
-- One row per imported equipment list (RFE)
-- ============================================================
CREATE TABLE IF NOT EXISTS fc_rfe_index (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  file_name     TEXT        NOT NULL DEFAULT '',
  count         INTEGER     NOT NULL DEFAULT 0,
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  headers       TEXT[]      NOT NULL DEFAULT '{}',
  display_config JSONB      NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Table: fc_items
-- One row per line in the imported CSV/XLSX.
-- item data stored as JSONB keyed by original header names.
-- ============================================================
CREATE TABLE IF NOT EXISTS fc_items (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  rfe_id      UUID    NOT NULL REFERENCES fc_rfe_index(id) ON DELETE CASCADE,
  item_index  INTEGER NOT NULL,
  data        JSONB   NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fc_items_rfe_id_idx       ON fc_items(rfe_id);
CREATE INDEX IF NOT EXISTS fc_items_rfe_index_idx    ON fc_items(rfe_id, item_index);

-- ============================================================
-- Table: fc_check_state
-- One row per (rfe_id, item_id) pair tracking check status.
-- UNIQUE constraint enables upsert conflict resolution.
-- ============================================================
CREATE TABLE IF NOT EXISTS fc_check_state (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rfe_id      UUID        NOT NULL REFERENCES fc_rfe_index(id) ON DELETE CASCADE,
  item_id     UUID        NOT NULL REFERENCES fc_items(id) ON DELETE CASCADE,
  checked     BOOLEAN     NOT NULL DEFAULT FALSE,
  note        TEXT        NOT NULL DEFAULT '',
  checked_at  TIMESTAMPTZ,
  checked_by  TEXT        NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rfe_id, item_id)
);

CREATE INDEX IF NOT EXISTS fc_check_state_rfe_id_idx ON fc_check_state(rfe_id);

-- ============================================================
-- Row Level Security — permissive (no auth required)
-- All crew members read/write freely. Enable auth later to lock down.
-- ============================================================
ALTER TABLE fc_rfe_index  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fc_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fc_check_state ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running migration
DROP POLICY IF EXISTS "allow_all_rfe_index"   ON fc_rfe_index;
DROP POLICY IF EXISTS "allow_all_items"        ON fc_items;
DROP POLICY IF EXISTS "allow_all_check_state"  ON fc_check_state;

CREATE POLICY "allow_all_rfe_index"  ON fc_rfe_index  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_items"      ON fc_items       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_check_state" ON fc_check_state FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- Enable Real-Time for all three tables
-- This publishes row-level changes to Supabase Realtime clients.
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE fc_rfe_index;
ALTER PUBLICATION supabase_realtime ADD TABLE fc_items;
ALTER PUBLICATION supabase_realtime ADD TABLE fc_check_state;
