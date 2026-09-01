-- 応募者ごとの面談予定、面談メモ、採否確定履歴を保持する。
-- 面談情報は応募レコード本体と分離し、応募内容を変更せずに再面談にも対応する。
CREATE TABLE IF NOT EXISTS atlasez_application_interviews (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE REFERENCES atlasez_member_applications(id) ON DELETE CASCADE,
  scheduled_at TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  mode TEXT NOT NULL CHECK(mode IN ('in_person','online')),
  zoom_url TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
  notified_at TEXT,
  notification_count INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_atlasez_application_interviews_scheduled
  ON atlasez_application_interviews(scheduled_at, status);

CREATE TABLE IF NOT EXISTS atlasez_application_interview_reviews (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE REFERENCES atlasez_member_applications(id) ON DELETE CASCADE,
  interview_id TEXT REFERENCES atlasez_application_interviews(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  assigned_subjects TEXT NOT NULL DEFAULT '',
  decision TEXT NOT NULL DEFAULT 'pending' CHECK(decision IN ('pending','hold','accepted','rejected')),
  finalized_at TEXT,
  finalized_by TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_atlasez_application_interview_reviews_decision
  ON atlasez_application_interview_reviews(decision, updated_at);

CREATE TABLE IF NOT EXISTS atlasez_application_interview_history (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES atlasez_member_applications(id) ON DELETE CASCADE,
  interview_id TEXT REFERENCES atlasez_application_interviews(id) ON DELETE SET NULL,
  review_id TEXT REFERENCES atlasez_application_interview_reviews(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  before_json TEXT NOT NULL DEFAULT '',
  after_json TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_atlasez_application_interview_history_application
  ON atlasez_application_interview_history(application_id, created_at DESC);

-- 面談案内も既存の応募メールキューから送信する。
DROP INDEX IF EXISTS idx_atlasez_application_email_deliveries_ready;
ALTER TABLE atlasez_application_email_deliveries
  RENAME TO atlasez_application_email_deliveries_interview_legacy;

CREATE TABLE atlasez_application_email_deliveries (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES atlasez_member_applications(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('applicant_confirmation','applicant_acceptance','applicant_discord_success','applicant_discord_failure','applicant_interview_invitation','operator_notification')),
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
FROM atlasez_application_email_deliveries_interview_legacy;

DROP TABLE atlasez_application_email_deliveries_interview_legacy;
CREATE INDEX idx_atlasez_application_email_deliveries_ready
  ON atlasez_application_email_deliveries(status, next_attempt_at, created_at);
