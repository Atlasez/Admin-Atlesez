-- 運営者が分野の目次を先に作成し、後から記事本文を執筆できるようにする。
CREATE TABLE IF NOT EXISTS editorial_outline_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES atlasez_projects(id) ON DELETE CASCADE,
  subject_slug TEXT NOT NULL,
  category_slug TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  concept_id TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, subject_slug, category_slug, slug)
);

CREATE INDEX IF NOT EXISTS idx_editorial_outline_entries_scope
  ON editorial_outline_entries(project_id, subject_slug, category_slug, status, sort_order);
