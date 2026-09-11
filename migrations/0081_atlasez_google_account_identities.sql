-- Keep Atlasez membership data keyed by the existing canonical email while
-- allowing more than one Google identity to authenticate as that member.
CREATE TABLE IF NOT EXISTS atlasez_accounts (
  id TEXT PRIMARY KEY,
  canonical_email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS atlasez_google_identities (
  google_subject TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES atlasez_accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_atlasez_google_identities_account
  ON atlasez_google_identities(account_id);

ALTER TABLE admin_auth_sessions ADD COLUMN account_id TEXT REFERENCES atlasez_accounts(id);
ALTER TABLE admin_auth_sessions ADD COLUMN google_subject TEXT;

CREATE INDEX IF NOT EXISTS idx_admin_auth_sessions_account
  ON admin_auth_sessions(account_id, expires_at);
