-- 完了タスクを一覧から安全に退避するためのアーカイブ情報。
-- 物理削除は行わず、監査・復元できる状態を保持する。
ALTER TABLE editorial_tasks ADD COLUMN archived_at TEXT;
ALTER TABLE editorial_tasks ADD COLUMN archived_by TEXT;
ALTER TABLE editorial_tasks ADD COLUMN archive_expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_editorial_tasks_archive
  ON editorial_tasks(archived_at, archive_expires_at, updated_at DESC);
