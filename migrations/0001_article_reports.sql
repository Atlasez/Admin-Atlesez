CREATE TABLE IF NOT EXISTS article_reports (
  id TEXT PRIMARY KEY,
  article_title TEXT NOT NULL,
  article_url TEXT NOT NULL,
  article_id TEXT,
  report_type TEXT NOT NULL,
  details TEXT NOT NULL,
  contact TEXT,
  locale TEXT NOT NULL,
  reporter_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_article_reports_created_at
  ON article_reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_article_reports_reporter_created
  ON article_reports(reporter_hash, created_at DESC);
