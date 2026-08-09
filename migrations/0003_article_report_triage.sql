ALTER TABLE article_reports ADD COLUMN status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE article_reports ADD COLUMN admin_note TEXT NOT NULL DEFAULT '';
ALTER TABLE article_reports ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_article_reports_status_created
  ON article_reports(status, created_at DESC);
