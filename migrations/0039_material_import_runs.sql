CREATE TABLE IF NOT EXISTS material_import_runs (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  source_folder_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('planning', 'importing', 'completed', 'needs-review', 'failed')),
  file_count INTEGER NOT NULL DEFAULT 0,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  imported_bytes INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT NOT NULL DEFAULT '',
  requested_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_material_import_runs_collection_created
  ON material_import_runs(collection_id, created_at DESC);
