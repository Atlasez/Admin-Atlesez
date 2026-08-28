-- 承認済み記事だけが設定できる公開予約を保存する。
ALTER TABLE editorial_documents ADD COLUMN scheduled_publish_at TEXT;
ALTER TABLE editorial_documents ADD COLUMN scheduled_publish_claimed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_editorial_documents_scheduled_publish
  ON editorial_documents (scheduled_publish_at, scheduled_publish_claimed_at)
  WHERE scheduled_publish_at IS NOT NULL AND published_at IS NULL;
