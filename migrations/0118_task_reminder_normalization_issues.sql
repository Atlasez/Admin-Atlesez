-- Keep malformed legacy reminder rows from blocking the bounded backfill.
-- Only the derived input values and an error category are stored; no personal
-- information is copied into this table.
CREATE TABLE IF NOT EXISTS editorial_task_reminder_normalization_issues (
  reminder_id TEXT PRIMARY KEY
    REFERENCES editorial_task_reminders(id) ON DELETE CASCADE,
  remind_at TEXT NOT NULL,
  timezone TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('invalid_time', 'invalid_timezone')),
  updated_at TEXT NOT NULL
);
