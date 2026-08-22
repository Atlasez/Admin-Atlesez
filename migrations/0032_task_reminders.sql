-- ToDoのリマインダー設定。日時は期限と同じタイムゾーンで解釈し、繰り返しはUIで選択した頻度を保存する。
ALTER TABLE editorial_tasks ADD COLUMN reminder_at TEXT;
ALTER TABLE editorial_tasks ADD COLUMN reminder_repeat TEXT NOT NULL DEFAULT 'none' CHECK(reminder_repeat IN ('none','once','daily','weekly','monthly'));
CREATE INDEX IF NOT EXISTS idx_editorial_tasks_reminder_at ON editorial_tasks(reminder_at);
