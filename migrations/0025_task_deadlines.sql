-- ToDoの期限を、入力したタイムゾーンとともに保存する。
ALTER TABLE editorial_tasks ADD COLUMN due_at TEXT;
ALTER TABLE editorial_tasks ADD COLUMN due_timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo';
CREATE INDEX IF NOT EXISTS idx_editorial_tasks_due_at ON editorial_tasks(due_at);
