-- Google OAuthを有効にした場合だけ使う運営画面のサーバー側セッション。
-- ブラウザーへはランダムなトークンだけを渡し、DBにはハッシュのみ保存する。
CREATE TABLE IF NOT EXISTS admin_auth_sessions (
  session_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_auth_sessions_expiry
  ON admin_auth_sessions(expires_at);
