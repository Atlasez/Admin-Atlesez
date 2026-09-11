-- 運営サイトだけで公開処理を完結させるため、PR・CI・配信確認を一つのRunとして追跡する。
CREATE TABLE IF NOT EXISTS editorial_publication_runs (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES editorial_documents(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('publish', 'unpublish')),
  state TEXT NOT NULL CHECK (state IN (
    'queued', 'checks_pending', 'merge_pending', 'deploy_pending',
    'retry_wait', 'published', 'unpublished', 'failed', 'needs_operator'
  )),
  attempt INTEGER NOT NULL DEFAULT 0,
  pull_request_number INTEGER,
  pull_request_url TEXT,
  branch TEXT,
  head_sha TEXT,
  merge_sha TEXT,
  last_check_at TEXT,
  next_attempt_at TEXT,
  error_code TEXT,
  error_message TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_editorial_publication_runs_document
  ON editorial_publication_runs(document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_editorial_publication_runs_active
  ON editorial_publication_runs(state, next_attempt_at, updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_editorial_publication_runs_one_active
  ON editorial_publication_runs(document_id)
  WHERE state IN ('queued', 'checks_pending', 'merge_pending', 'deploy_pending', 'retry_wait');
