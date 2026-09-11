-- 古い環境を含め、公開前の下書きを一覧から一時的に隠せる列を用意する。
-- 本番では同名Migrationが適用済みのため、既存データには再適用されない。
ALTER TABLE editorial_documents ADD COLUMN archived_at TEXT;
ALTER TABLE editorial_documents ADD COLUMN archived_by TEXT;

CREATE INDEX IF NOT EXISTS idx_editorial_documents_archived
  ON editorial_documents(archived_at, updated_at DESC);
