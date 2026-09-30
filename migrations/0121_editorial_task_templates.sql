CREATE TABLE IF NOT EXISTS editorial_task_templates (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES atlasez_projects(id),
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  assignees_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(assignees_json)),
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  schedule TEXT NOT NULL DEFAULT 'none' CHECK(schedule IN ('none','daily','weekly','monthly')),
  anchor_at TEXT,
  due_after_days INTEGER CHECK(due_after_days IS NULL OR due_after_days BETWEEN 0 AND 90),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  next_run_at TEXT,
  last_task_id TEXT,
  last_generated_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_editorial_task_templates_due ON editorial_task_templates(enabled,next_run_at);
CREATE INDEX idx_editorial_task_templates_owner ON editorial_task_templates(owner_email,created_at DESC);
