-- コメント本文とは独立した、検索・絞り込み可能なレビュータグ。
CREATE TABLE IF NOT EXISTS editorial_comment_tags (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES editorial_comments(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  tag TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_editorial_comment_tags_comment_tag
  ON editorial_comment_tags(comment_id, tag);
CREATE INDEX IF NOT EXISTS idx_editorial_comment_tags_tag_comment
  ON editorial_comment_tags(tag, comment_id);
