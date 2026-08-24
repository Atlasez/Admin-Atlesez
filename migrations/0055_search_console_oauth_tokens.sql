-- Search Consoleの定期取得に使う、運営者が明示的に許可したOAuthリフレッシュトークン。
-- アクセス権限はWorkerの認証境界とD1の本番権限で保護し、画面やAPIレスポンスには返さない。
CREATE TABLE IF NOT EXISTS search_console_oauth_tokens (
  email TEXT PRIMARY KEY,
  refresh_token TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
