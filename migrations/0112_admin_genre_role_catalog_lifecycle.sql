ALTER TABLE admin_genre_role_catalog ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE admin_genre_role_catalog ADD COLUMN updated_by TEXT NOT NULL DEFAULT '';
ALTER TABLE admin_genre_role_catalog ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE admin_genre_role_catalog ADD COLUMN permission_scope TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_admin_genre_role_catalog_project_kind_status
  ON admin_genre_role_catalog(project_id, kind, status, name);
