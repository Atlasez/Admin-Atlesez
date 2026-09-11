-- 公開Runを安全に再開できるよう、排他・失敗分類・GitHub診断情報を保持する。
ALTER TABLE editorial_publication_runs ADD COLUMN idempotency_key TEXT;
ALTER TABLE editorial_publication_runs ADD COLUMN lease_until TEXT;
ALTER TABLE editorial_publication_runs ADD COLUMN failure_kind TEXT;
ALTER TABLE editorial_publication_runs ADD COLUMN check_name TEXT;
ALTER TABLE editorial_publication_runs ADD COLUMN check_url TEXT;
ALTER TABLE editorial_publication_runs ADD COLUMN diagnostic_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_editorial_publication_runs_idempotency
  ON editorial_publication_runs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
