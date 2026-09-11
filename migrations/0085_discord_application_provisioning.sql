-- 応募者本人のDiscord OAuth2連携と、承認後の自動参加・再試行状態を保持する。
ALTER TABLE atlasez_member_discord_accounts ADD COLUMN access_token_ciphertext TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_discord_accounts ADD COLUMN refresh_token_ciphertext TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_discord_accounts ADD COLUMN token_expires_at TEXT;
ALTER TABLE atlasez_member_discord_accounts ADD COLUMN oauth_scope TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_discord_accounts ADD COLUMN oauth_connected_at TEXT;

ALTER TABLE atlasez_member_applications ADD COLUMN provisioning_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE atlasez_member_applications ADD COLUMN provisioning_next_attempt_at TEXT;
ALTER TABLE atlasez_member_applications ADD COLUMN provisioning_last_attempt_at TEXT;

CREATE TABLE IF NOT EXISTS atlasez_discord_oauth_states (
  state_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  return_path TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_atlasez_discord_oauth_states_expiry
  ON atlasez_discord_oauth_states(expires_at);

-- 0071で作られた配信キューにDiscord連携の成功・失敗通知種別を追加する。
DROP INDEX IF EXISTS idx_atlasez_application_email_deliveries_ready;
ALTER TABLE atlasez_application_email_deliveries
  RENAME TO atlasez_application_email_deliveries_discord_legacy;

CREATE TABLE atlasez_application_email_deliveries (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES atlasez_member_applications(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('applicant_confirmation','applicant_acceptance','applicant_discord_success','applicant_discord_failure','operator_notification')),
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
FROM atlasez_application_email_deliveries_discord_legacy;

DROP TABLE atlasez_application_email_deliveries_discord_legacy;
CREATE INDEX idx_atlasez_application_email_deliveries_ready
  ON atlasez_application_email_deliveries(status, next_attempt_at, created_at);
