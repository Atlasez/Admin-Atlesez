-- 1つの原稿に複数の査読担当者を紐づけるための明細テーブル。
-- 既存の editorial_review_assignments は後方互換用の代表値として残す。
CREATE TABLE IF NOT EXISTS editorial_review_assignment_recipients (
  document_id TEXT NOT NULL REFERENCES editorial_documents(id) ON DELETE CASCADE,
  reviewer_email TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(document_id, reviewer_email)
);

CREATE INDEX IF NOT EXISTS idx_editorial_review_recipients_reviewer
  ON editorial_review_assignment_recipients(reviewer_email, updated_at DESC);
