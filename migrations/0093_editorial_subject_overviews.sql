-- 各ジャンル概要で表示する、ジャンル単位の現在の進捗メモ。
-- 公開記事本文やGitHubの正本とは分離し、運営サイトだけで管理する。
CREATE TABLE IF NOT EXISTS editorial_subject_overviews (
  project_id TEXT NOT NULL REFERENCES atlasez_projects(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  progress TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, subject)
);

CREATE INDEX IF NOT EXISTS idx_editorial_subject_overviews_project_updated
  ON editorial_subject_overviews(project_id, updated_at DESC);
