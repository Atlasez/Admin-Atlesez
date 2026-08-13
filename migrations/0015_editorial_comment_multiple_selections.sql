-- 一つのコメント／返信に複数の本文範囲を紐づける。
CREATE TABLE IF NOT EXISTS editorial_comment_selections (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES editorial_comments(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  selection_start INTEGER,
  selection_end INTEGER,
  selection_text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_editorial_comment_selections_comment_position
  ON editorial_comment_selections(comment_id, position ASC);
