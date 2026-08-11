-- 公開済み記事のMarkdown/LaTexをGitHub履歴とは別に世代保存する。
CREATE TABLE IF NOT EXISTS article_source_backups (
  id TEXT PRIMARY KEY,
  repository TEXT NOT NULL,
  path TEXT NOT NULL,
  git_sha TEXT NOT NULL,
  body TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('scheduled', 'publish')),
  captured_at TEXT NOT NULL,
  UNIQUE(repository, path, git_sha)
);
CREATE INDEX IF NOT EXISTS idx_article_source_backups_path_captured
  ON article_source_backups(repository, path, captured_at DESC);
