-- フィードバック依頼も通常のタスク一覧・通知で扱えるようにする。
-- task_kind は将来のタスク種別追加を妨げない文字列として保持し、
-- 既存行は通常の「タスク依頼」として扱う。
ALTER TABLE editorial_tasks ADD COLUMN task_kind TEXT NOT NULL DEFAULT 'task';
ALTER TABLE editorial_review_assignments ADD COLUMN task_id TEXT;

CREATE INDEX IF NOT EXISTS idx_editorial_tasks_kind_status
  ON editorial_tasks(task_kind, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_editorial_review_assignments_task
  ON editorial_review_assignments(task_id);
