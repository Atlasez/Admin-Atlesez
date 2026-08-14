-- 学習サイト固有だったToDoと各プロジェクトのToDoを同じ表へ統合する。
-- 既存の editorial_tasks を正規テーブルとして拡張することで、
-- コメント確認（editorial_task_feedback）など既存の学習サイト機能も維持する。
ALTER TABLE editorial_tasks ADD COLUMN project_id TEXT NOT NULL DEFAULT 'atlas';

INSERT OR IGNORE INTO editorial_tasks (
  id, project_id, subject, assignee_email, title, details, status,
  due_at, due_timezone, reminder_at, reminder_repeat,
  created_by, created_at, updated_at
)
SELECT
  id, project_id, subject, assignee_email, title, details, status,
  NULL, 'Asia/Tokyo', NULL, 'none',
  created_by, created_at, updated_at
FROM atlasez_project_todos;

CREATE INDEX IF NOT EXISTS idx_editorial_tasks_project_status
  ON editorial_tasks(project_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_editorial_tasks_project_assignee
  ON editorial_tasks(project_id, assignee_email, status, updated_at DESC);
