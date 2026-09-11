-- 執筆完了後の分野統括→プロジェクトリーダー承認を記録する。
ALTER TABLE editorial_documents ADD COLUMN publication_review_stage TEXT
  CHECK (publication_review_stage IS NULL OR publication_review_stage IN ('subject-coordinator', 'project-leader'));
ALTER TABLE editorial_documents ADD COLUMN publication_review_round INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS editorial_workflow_roles (
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('subject-coordinator', 'project-leader')),
  subject TEXT NOT NULL DEFAULT '*',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  PRIMARY KEY (email, role, subject)
);
CREATE INDEX IF NOT EXISTS idx_editorial_workflow_roles_subject
  ON editorial_workflow_roles(role, subject, email);

CREATE TABLE IF NOT EXISTS editorial_publication_reviews (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES editorial_documents(id) ON DELETE CASCADE,
  review_round INTEGER NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('subject-coordinator', 'project-leader')),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  actor_email TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_editorial_publication_reviews_document
  ON editorial_publication_reviews(document_id, review_round, created_at DESC);

-- プロジェクトリーダーは釜口悠太さんのみ。
INSERT OR IGNORE INTO editorial_workflow_roles
  (email, role, subject, created_at, created_by)
VALUES
  ('yuta.k20030828@gmail.com', 'project-leader', '*', '2026-08-28T00:00:00.000Z', 'system');
