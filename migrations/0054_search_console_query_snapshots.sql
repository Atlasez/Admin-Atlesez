-- Search Consoleから取得した検索クエリ別パフォーマンスのスナップショット。
-- 検索語は管理者向けの集計表示に必要な範囲だけ保存し、個人情報やURLは保存しない。
CREATE TABLE IF NOT EXISTS search_console_query_snapshots (
  snapshot_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  query TEXT NOT NULL,
  clicks REAL NOT NULL DEFAULT 0,
  impressions REAL NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, query)
);

CREATE INDEX IF NOT EXISTS idx_search_console_query_snapshots_fetched
  ON search_console_query_snapshots(fetched_at DESC);
