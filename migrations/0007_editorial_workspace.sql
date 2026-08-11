-- 運営者だけが使う記事執筆・査読ワークスペース。
-- 公開サイトのMarkdown原稿とは分離して保存し、承認後にGitHub公開用の原稿を出力する。
CREATE TABLE IF NOT EXISTS editorial_documents (
  id TEXT PRIMARY KEY,
  source_article_id TEXT,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'ja',
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  concept_id TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in-review', 'approved')),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_editorial_documents_subject_updated
  ON editorial_documents(subject, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_editorial_documents_status_updated
  ON editorial_documents(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS editorial_comments (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES editorial_documents(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_editorial_comments_document_created
  ON editorial_comments(document_id, created_at ASC);
