-- Discord通知の送信結果と再送キュー。既存テーブルは変更しない。
-- Webhook URLとBot tokenは保存せず、環境変数名またはチャンネルIDだけを持つ。
CREATE TABLE IF NOT EXISTS discord_notifications (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  destination_kind TEXT NOT NULL CHECK(destination_kind IN ('webhook', 'channel')),
  destination_ref TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'sending', 'retry', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  next_attempt_at TEXT NOT NULL,
  claim_token TEXT,
  claimed_at TEXT,
  sent_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_discord_notifications_ready
  ON discord_notifications(status, next_attempt_at, created_at);
