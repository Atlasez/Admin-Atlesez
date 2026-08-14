-- 査読依頼を特定の運営メンバーへ割り当てる。
-- 1原稿につき現在の担当者を1人だけ保持し、担当変更時は同じ行を更新する。
CREATE TABLE IF NOT EXISTS editorial_review_assignments (
  document_id TEXT PRIMARY KEY REFERENCES editorial_documents(id) ON DELETE CASCADE,
  reviewer_email TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_editorial_review_assignments_reviewer
  ON editorial_review_assignments(reviewer_email, updated_at DESC);
