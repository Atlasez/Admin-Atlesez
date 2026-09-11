-- 公開用PRを作る前に、対象ブランチを公開サイトのCIで検証する。
-- 事前検証の実行IDと受付時刻を保存し、PRを作らずに失敗理由を返せるようにする。
ALTER TABLE editorial_publication_runs ADD COLUMN preflight_run_id INTEGER;
ALTER TABLE editorial_publication_runs ADD COLUMN preflight_requested_at TEXT;

CREATE INDEX IF NOT EXISTS idx_editorial_publication_runs_preflight
  ON editorial_publication_runs(preflight_run_id, preflight_requested_at);
