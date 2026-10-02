CREATE TABLE IF NOT EXISTS editorial_task_workspaces (
  task_id TEXT PRIMARY KEY REFERENCES editorial_tasks(id),
  summary TEXT NOT NULL DEFAULT '',
  next_action TEXT NOT NULL DEFAULT '',
  waiting_for TEXT NOT NULL DEFAULT '',
  document_id TEXT,
  checklist_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(checklist_json)),
  dependencies_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(dependencies_json)),
  revision INTEGER NOT NULL DEFAULT 1,
  operation_id TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS editorial_task_handoffs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES editorial_tasks(id),
  summary TEXT NOT NULL,
  next_action TEXT NOT NULL,
  waiting_for TEXT NOT NULL,
  from_assignees TEXT,
  to_assignees TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS task_handoffs_task_created
  ON editorial_task_handoffs(task_id,created_at DESC,id DESC);
