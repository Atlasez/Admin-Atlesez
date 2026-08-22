-- 1つの期限に複数の絶対時刻リマインダーを設定できるようにする。
-- 既存の editorial_tasks.reminder_at / reminder_repeat は旧クライアント互換のため残す。
CREATE TABLE IF NOT EXISTS editorial_task_reminders (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES editorial_tasks(id) ON DELETE CASCADE,
  remind_at TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  label TEXT NOT NULL DEFAULT '',
  notified_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_editorial_task_reminders_due
  ON editorial_task_reminders(remind_at, notified_at);
CREATE INDEX IF NOT EXISTS idx_editorial_task_reminders_task
  ON editorial_task_reminders(task_id, remind_at);

-- 既存の単一リマインダーも新しい一覧へ一度だけ取り込む。
INSERT OR IGNORE INTO editorial_task_reminders
  (id, task_id, remind_at, timezone, label, created_at)
SELECT
  'legacy-' || id,
  id,
  reminder_at,
  due_timezone,
  CASE reminder_repeat
    WHEN 'daily' THEN '毎日'
    WHEN 'weekly' THEN '毎週'
    WHEN 'monthly' THEN '毎月'
    ELSE 'リマインダー'
  END,
  created_at
FROM editorial_tasks
WHERE reminder_at IS NOT NULL AND reminder_at <> '';
