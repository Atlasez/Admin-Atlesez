-- 公開要求が参照した記事の世代を固定し、古いrunが新しい編集内容を公開しないようにする。
ALTER TABLE editorial_publication_runs ADD COLUMN snapshot_updated_at TEXT;
ALTER TABLE editorial_publication_runs ADD COLUMN snapshot_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_editorial_publication_runs_snapshot
  ON editorial_publication_runs(document_id, snapshot_updated_at, created_at DESC);
