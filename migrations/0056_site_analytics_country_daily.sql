-- 公開サイトの訪問者を個人識別せず、Cloudflareの国コード単位で日別集計する。
CREATE TABLE IF NOT EXISTS site_analytics_country_daily (
  day TEXT NOT NULL,
  country TEXT NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, country)
);

CREATE INDEX IF NOT EXISTS idx_site_analytics_country_daily_day
  ON site_analytics_country_daily(day DESC);
