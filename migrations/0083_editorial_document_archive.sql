-- 下書きを記事一覧から一時的に隠し、期限内に復元できるようにする。
ALTER TABLE editorial_documents ADD COLUMN archived_at TEXT;
ALTER TABLE editorial_documents ADD COLUMN archive_expires_at TEXT;
CREATE INDEX IF NOT EXISTS idx_editorial_documents_archive
  ON editorial_documents(archived_at, archive_expires_at, updated_at DESC);
