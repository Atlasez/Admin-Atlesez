CREATE TABLE IF NOT EXISTS admin_genre_role_catalog (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES atlasez_projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('genre', 'role')),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, kind, slug)
);
CREATE INDEX IF NOT EXISTS idx_admin_genre_role_catalog_project_kind
  ON admin_genre_role_catalog(project_id, kind, name);

CREATE TABLE IF NOT EXISTS admin_genre_role_assignments (
  catalog_id TEXT NOT NULL REFERENCES admin_genre_role_catalog(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(catalog_id, email)
);
CREATE INDEX IF NOT EXISTS idx_admin_genre_role_assignments_email
  ON admin_genre_role_assignments(email, catalog_id);
