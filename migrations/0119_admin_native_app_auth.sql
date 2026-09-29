-- Short-lived, one-time grants bridge the system-browser Google login to the
-- standalone macOS app. Only token digests are stored; grants expire quickly.
CREATE TABLE IF NOT EXISTS admin_native_app_grants (
  code_hash TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL
    REFERENCES admin_auth_sessions(session_hash) ON DELETE CASCADE,
  code_challenge TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_native_app_grants_expiry
  ON admin_native_app_grants(expires_at);
