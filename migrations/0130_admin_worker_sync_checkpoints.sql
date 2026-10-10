-- Keep scheduled GitHub synchronization resumable while limiting each Worker
-- invocation to a small number of D1 and GitHub subrequests.
CREATE TABLE IF NOT EXISTS admin_worker_sync_checkpoints (
  job TEXT PRIMARY KEY,
  cursor TEXT,
  updated_at TEXT NOT NULL
);
