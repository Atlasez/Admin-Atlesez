ALTER TABLE article_reports ADD COLUMN content_hash TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_article_reports_content_created
  ON article_reports(content_hash, created_at DESC);
