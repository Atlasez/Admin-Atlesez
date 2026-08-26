-- 応募を受け付けたときの対応タスクとメール配信キューを保持する。
-- メール送信が一時的に失敗しても、応募データ自体と運営の対応タスクは失わない。
CREATE TABLE IF NOT EXISTS atlasez_application_email_deliveries (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES atlasez_member_applications(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('applicant_confirmation','operator_notification')),
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL,
  html_body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','retry','sent','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  claim_token TEXT,
  claimed_at TEXT,
  sent_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(application_id, recipient_email, kind)
);

CREATE INDEX IF NOT EXISTS idx_atlasez_application_email_deliveries_ready
  ON atlasez_application_email_deliveries(status, next_attempt_at, created_at);
