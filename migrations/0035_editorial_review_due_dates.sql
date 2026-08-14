-- 査読依頼の期限を担当者と一緒に保存する。
ALTER TABLE editorial_review_assignments ADD COLUMN due_at TEXT;

CREATE INDEX IF NOT EXISTS idx_editorial_review_assignments_due
  ON editorial_review_assignments(due_at);
