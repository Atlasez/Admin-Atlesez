-- Cloudflareが推定した日本の地域コードだけを、個人を識別しない日別集計として保存する。
-- 市区町村名・緯度経度・IPアドレスは保存しない。
CREATE TABLE IF NOT EXISTS article_analytics_region_daily (
  day TEXT NOT NULL,
  country TEXT NOT NULL,
  region_code TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  engaged_reads INTEGER NOT NULL DEFAULT 0,
  completed_reads INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, country, region_code)
);

CREATE INDEX IF NOT EXISTS idx_article_analytics_region_daily_country_day
  ON article_analytics_region_daily(country, day DESC);
