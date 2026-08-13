-- 査読コメントを「選択範囲を持つスレッド」として扱うための状態を追加する。
-- NULL のままの既存コメントは、範囲指定なし・未確認・未解決としてそのまま利用できる。
ALTER TABLE editorial_comments ADD COLUMN selection_start INTEGER;
ALTER TABLE editorial_comments ADD COLUMN selection_end INTEGER;
ALTER TABLE editorial_comments ADD COLUMN selection_text TEXT;
ALTER TABLE editorial_comments ADD COLUMN acknowledged_at TEXT;
ALTER TABLE editorial_comments ADD COLUMN acknowledged_by TEXT;
ALTER TABLE editorial_comments ADD COLUMN resolved_at TEXT;
ALTER TABLE editorial_comments ADD COLUMN resolved_by TEXT;

CREATE INDEX IF NOT EXISTS idx_editorial_comments_document_resolution
  ON editorial_comments(document_id, resolved_at, created_at ASC);
