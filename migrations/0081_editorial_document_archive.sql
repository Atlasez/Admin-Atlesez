-- 公開前の下書きを原稿一覧から退避・復元できるようにする。
ALTER TABLE editorial_documents ADD COLUMN archived_at TEXT;
ALTER TABLE editorial_documents ADD COLUMN archived_by TEXT;

CREATE INDEX IF NOT EXISTS idx_editorial_documents_archived
  ON editorial_documents (archived_at, updated_at DESC);
