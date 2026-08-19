-- 公開サイト（公式サイト・学習サイト）を見に来た人の接続元を、都市単位の集計値として保存する。
-- 外部の統計サービスから受け取る集計済みの件数だけを持ち、個々のアクセス記録・IPアドレス・
-- 端末情報は一切保存しない。運営サイトへのログイン情報もここには入れない。
CREATE TABLE IF NOT EXISTS visitor_geo_snapshots (
  snapshot_id TEXT NOT NULL,
  source TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total_views REAL NOT NULL DEFAULT 0,
  country TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  views REAL NOT NULL DEFAULT 0,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, country, city, latitude, longitude)
);

CREATE INDEX IF NOT EXISTS idx_visitor_geo_snapshots_fetched
  ON visitor_geo_snapshots(fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_visitor_geo_snapshots_views
  ON visitor_geo_snapshots(snapshot_id, views DESC);
