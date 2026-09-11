CREATE TABLE IF NOT EXISTS admin_editorial_taxonomy_catalog (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES atlasez_projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('subject', 'category')),
  subject_slug TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, kind, subject_slug, slug)
);
CREATE INDEX IF NOT EXISTS idx_admin_editorial_taxonomy_project
  ON admin_editorial_taxonomy_catalog(project_id, kind, subject_slug, status, sort_order);
