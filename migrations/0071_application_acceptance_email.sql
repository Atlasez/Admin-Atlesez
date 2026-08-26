-- 受入確定時に応募者へ送るメールを、受付確認メールと別の配信種別として保持する。
DROP INDEX IF EXISTS idx_atlasez_application_email_deliveries_ready;
ALTER TABLE atlasez_application_email_deliveries
  RENAME TO atlasez_application_email_deliveries_legacy;

CREATE TABLE atlasez_application_email_deliveries (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES atlasez_member_applications(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('applicant_confirmation','applicant_acceptance','operator_notification')),
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

INSERT INTO atlasez_application_email_deliveries (
  id,application_id,recipient_email,kind,subject,text_body,html_body,status,
  attempt_count,next_attempt_at,claim_token,claimed_at,sent_at,last_error,created_at,updated_at
)
SELECT
  id,application_id,recipient_email,kind,subject,text_body,html_body,status,
  attempt_count,next_attempt_at,claim_token,claimed_at,sent_at,last_error,created_at,updated_at
FROM atlasez_application_email_deliveries_legacy;

DROP TABLE atlasez_application_email_deliveries_legacy;
CREATE INDEX idx_atlasez_application_email_deliveries_ready
  ON atlasez_application_email_deliveries(status, next_attempt_at, created_at);
