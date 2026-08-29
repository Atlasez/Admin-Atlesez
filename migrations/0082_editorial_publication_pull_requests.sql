-- 公開・公開取り消しをmainへの直接書き込みではなく、GitHub PRとして追跡する。
ALTER TABLE editorial_documents ADD COLUMN publication_pr_number INTEGER;
ALTER TABLE editorial_documents ADD COLUMN publication_pr_url TEXT;
ALTER TABLE editorial_documents ADD COLUMN publication_branch TEXT;
ALTER TABLE editorial_documents ADD COLUMN publication_action TEXT
  CHECK (publication_action IS NULL OR publication_action IN ('publish', 'unpublish'));
ALTER TABLE editorial_documents ADD COLUMN publication_requested_at TEXT;

CREATE INDEX IF NOT EXISTS idx_editorial_documents_publication_pr
  ON editorial_documents(publication_pr_number)
  WHERE publication_pr_number IS NOT NULL;
