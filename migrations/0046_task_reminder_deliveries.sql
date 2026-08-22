CREATE TABLE IF NOT EXISTS editorial_task_reminder_deliveries (
  reminder_id TEXT NOT NULL REFERENCES editorial_task_reminders(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (reminder_id, recipient_email)
);

CREATE INDEX IF NOT EXISTS idx_task_reminder_deliveries_recipient
  ON editorial_task_reminder_deliveries(recipient_email, sent_at);
