CREATE TABLE IF NOT EXISTS admin_notification_preferences (
  email TEXT PRIMARY KEY,
  muted_kinds TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(muted_kinds)),
  summary_enabled INTEGER NOT NULL DEFAULT 1 CHECK(summary_enabled IN (0,1)),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_notification_snoozes (
  email TEXT NOT NULL,
  notification_id TEXT NOT NULL,
  until_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(email,notification_id)
);
CREATE INDEX idx_admin_notification_snoozes_due ON admin_notification_snoozes(email,until_at);
