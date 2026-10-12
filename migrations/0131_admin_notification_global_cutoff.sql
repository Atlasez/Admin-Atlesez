-- Capture one shared boundary for a clean notification inbox without changing
-- the task, comment, application, or publication records that produce notices.
CREATE TABLE IF NOT EXISTS admin_notification_global_cutoff (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  cleared_before TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO admin_notification_global_cutoff (singleton, cleared_before, updated_at)
VALUES (
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(singleton) DO NOTHING;
