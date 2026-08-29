-- archived_at / archived_by は既存の運用環境で先に作成済みのため、
-- このMigrationでは復元期限だけを追加する。
ALTER TABLE editorial_documents ADD COLUMN archive_expires_at TEXT;
CREATE INDEX IF NOT EXISTS idx_editorial_documents_archive
  ON editorial_documents(archived_at, archive_expires_at, updated_at DESC);
