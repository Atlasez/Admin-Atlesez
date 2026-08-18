-- 個人を識別せず、成功した運営サイトログインの国だけを日別に集計する。
CREATE TABLE IF NOT EXISTS admin_login_country_daily (
  day TEXT NOT NULL,
  country TEXT NOT NULL,
  logins INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, country)
);

CREATE INDEX IF NOT EXISTS idx_admin_login_country_daily_day
  ON admin_login_country_daily(day DESC);

-- Search Consoleから取得した国別検索パフォーマンスのスナップショット。
-- 検索語やURLは保存せず、管理画面の集計表示に必要な値だけを保持する。
CREATE TABLE IF NOT EXISTS search_console_country_snapshots (
  snapshot_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  country TEXT NOT NULL,
  clicks REAL NOT NULL DEFAULT 0,
  impressions REAL NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, country)
);

CREATE INDEX IF NOT EXISTS idx_search_console_country_snapshots_fetched
  ON search_console_country_snapshots(fetched_at DESC);
