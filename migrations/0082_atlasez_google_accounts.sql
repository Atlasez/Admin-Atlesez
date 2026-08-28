-- 1つのAtlasezアカウントに複数のGoogle IDを安全に連携する。
CREATE TABLE IF NOT EXISTS atlasez_accounts (
  id TEXT PRIMARY KEY,
  canonical_email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS atlasez_google_identities (
  google_subject TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES atlasez_accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_atlasez_google_identities_account
  ON atlasez_google_identities(account_id, created_at, email);
CREATE INDEX IF NOT EXISTS idx_atlasez_google_identities_email
  ON atlasez_google_identities(email);

ALTER TABLE admin_auth_sessions ADD COLUMN account_id TEXT;
ALTER TABLE admin_auth_sessions ADD COLUMN google_subject TEXT;
