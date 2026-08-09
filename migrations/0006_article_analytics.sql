-- 個人を識別せず、記事ごとの閲覧・読了目安を日別に集計する。
CREATE TABLE IF NOT EXISTS article_analytics_daily (
  day TEXT NOT NULL,
  article_id TEXT NOT NULL,
  article_title TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  locale TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  engaged_reads INTEGER NOT NULL DEFAULT 0,
  completed_reads INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, article_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_article_analytics_daily_subject_day
  ON article_analytics_daily(subject, day DESC);

CREATE INDEX IF NOT EXISTS idx_article_analytics_daily_day
  ON article_analytics_daily(day DESC);
