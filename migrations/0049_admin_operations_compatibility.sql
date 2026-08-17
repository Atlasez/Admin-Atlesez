-- 本番D1では先行マイグレーションにより事務局プロジェクトとToDoの
-- project_idが既に存在するため、運営UIで不足している列・履歴だけを補う。
ALTER TABLE editorial_progress_reports ADD COLUMN project_id TEXT NOT NULL DEFAULT 'atlas';
ALTER TABLE editorial_events ADD COLUMN project_id TEXT NOT NULL DEFAULT 'atlas';
ALTER TABLE editorial_documents ADD COLUMN writing_memo TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_editorial_progress_project_created
  ON editorial_progress_reports(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_editorial_events_project_start
  ON editorial_events(project_id, starts_at ASC);

CREATE TABLE IF NOT EXISTS editorial_comment_actions (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES editorial_comments(id) ON DELETE CASCADE,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('acknowledge','unacknowledge','resolve','reopen')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_editorial_comment_actions_comment_created
  ON editorial_comment_actions(comment_id, created_at ASC);

CREATE TABLE IF NOT EXISTS editorial_member_availability_blocks (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  label TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'unavailable' CHECK(kind IN ('available','unavailable')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_editorial_member_availability_email_start
  ON editorial_member_availability_blocks(email, starts_at ASC);

CREATE TABLE IF NOT EXISTS editorial_review_assignments (
  document_id TEXT PRIMARY KEY REFERENCES editorial_documents(id) ON DELETE CASCADE,
  reviewer_email TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  due_at TEXT
);
