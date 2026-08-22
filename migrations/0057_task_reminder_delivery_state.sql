-- リマインダーは壁時計時刻に加えて絶対時刻も保持し、cronの比較をUTCで行う。
-- 既存行はWorkerがTemporalで安全に正規化する（SQLite単体ではIANA timezoneを変換できない）。
ALTER TABLE editorial_task_reminders ADD COLUMN remind_at_utc TEXT;

CREATE INDEX IF NOT EXISTS idx_editorial_task_reminders_due_utc
  ON editorial_task_reminders(remind_at_utc, notified_at);

-- deliveryをoccurrence単位の永続outboxとして保持する。
-- provider_idempotency_keyは同一payloadのretryで必ず再利用する。
CREATE TABLE IF NOT EXISTS editorial_task_reminder_delivery_attempts (
  delivery_key TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL REFERENCES editorial_task_reminders(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL COLLATE NOCASE,
  occurrence_at TEXT NOT NULL,
  occurrence_timezone TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  provider_idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'sending', 'retry', 'sent', 'failed')),
  claim_token TEXT,
  claimed_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  next_attempt_at TEXT NOT NULL,
  retry_deadline_at TEXT NOT NULL,
  sent_at TEXT,
  provider_message_id TEXT,
  error_category TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(reminder_id, recipient_email, occurrence_at)
);

CREATE INDEX IF NOT EXISTS idx_task_reminder_attempts_ready
  ON editorial_task_reminder_delivery_attempts(status, next_attempt_at, claimed_at);
CREATE INDEX IF NOT EXISTS idx_task_reminder_attempts_reminder
  ON editorial_task_reminder_delivery_attempts(reminder_id, occurrence_at);

-- 旧deliveryの送信済み記録は保持し、再送を防ぐ。旧pending sentinelは
-- crash後にretryできるよう移行せず、新outboxで改めてclaimする。
INSERT OR IGNORE INTO editorial_task_reminder_delivery_attempts (
  delivery_key, reminder_id, recipient_email, occurrence_at,
  occurrence_timezone, payload_json, provider_idempotency_key, status,
  attempt_count, next_attempt_at, retry_deadline_at, sent_at,
  created_at, updated_at
)
SELECT
  'legacy:' || d.reminder_id || ':' || lower(d.recipient_email),
  d.reminder_id,
  lower(d.recipient_email),
  r.remind_at,
  r.timezone,
  '{}',
  'legacy:' || d.reminder_id || ':' || lower(d.recipient_email),
  'sent',
  1,
  d.sent_at,
  d.sent_at,
  d.sent_at,
  d.sent_at,
  d.sent_at
FROM editorial_task_reminder_deliveries d
JOIN editorial_task_reminders r ON r.id = d.reminder_id
WHERE d.sent_at NOT LIKE '__pending__:%';

CREATE INDEX IF NOT EXISTS idx_editorial_review_assignments_reviewer
  ON editorial_review_assignments(reviewer_email, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_editorial_review_assignments_due
  ON editorial_review_assignments(due_at, updated_at DESC);
