-- Cross-project design guidance distilled from feedback and linked to its sources.
CREATE TABLE IF NOT EXISTS admin_design_principles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('selection','information','feedback','accessibility','consistency','other')),
  statement TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','active','archived')),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_design_principles_status_category
  ON admin_design_principles(status, category, updated_at DESC);

CREATE TABLE IF NOT EXISTS admin_design_principle_sources (
  id TEXT PRIMARY KEY,
  principle_id TEXT NOT NULL REFERENCES admin_design_principles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  href TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_design_principle_sources_principle
  ON admin_design_principle_sources(principle_id, sort_order, created_at);
