-- 査読コメントへの返信をスレッドとして保持する。
ALTER TABLE editorial_comments ADD COLUMN parent_comment_id TEXT REFERENCES editorial_comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_editorial_comments_parent_created
  ON editorial_comments(parent_comment_id, created_at ASC);
