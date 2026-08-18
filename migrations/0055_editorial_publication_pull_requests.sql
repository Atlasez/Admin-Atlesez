-- 公開候補をGitHub PRとして追跡し、main反映前の状態を管理する。
ALTER TABLE editorial_documents ADD COLUMN publication_pr_url TEXT;
ALTER TABLE editorial_documents ADD COLUMN publication_branch TEXT;
ALTER TABLE editorial_documents ADD COLUMN publication_requested_at TEXT;
ALTER TABLE editorial_documents ADD COLUMN publication_action TEXT
  CHECK (publication_action IN ('publish', 'unpublish'));
