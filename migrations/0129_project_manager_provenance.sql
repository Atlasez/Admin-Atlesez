-- Existing appointments are not silently reclassified as permission-derived.
CREATE TABLE IF NOT EXISTS atlasez_project_manager_grants (
  project_id TEXT NOT NULL REFERENCES atlasez_projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('permission','explicit','legacy')),
  granted_by TEXT NOT NULL DEFAULT '',
  granted_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  operation_id TEXT NOT NULL DEFAULT '',
  review_required INTEGER NOT NULL DEFAULT 0 CHECK(review_required IN (0,1)),
  PRIMARY KEY(project_id,email)
);

INSERT OR IGNORE INTO atlasez_project_manager_grants(project_id,email,source,granted_by,granted_at)
SELECT project_id,lower(email),'legacy','migration-0129',joined_at
FROM atlasez_project_memberships WHERE role='manager';
