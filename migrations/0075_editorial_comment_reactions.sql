-- コメントに文化的に中立な笑顔リアクションを保存する。
-- 将来リアクションを増やせるよう文字列で持つが、現在のUIは smile のみを使用する。
CREATE TABLE IF NOT EXISTS editorial_comment_reactions (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES editorial_comments(id) ON DELETE CASCADE,
  actor_email TEXT NOT NULL,
  reaction TEXT NOT NULL DEFAULT 'smile' CHECK(reaction = 'smile'),
  created_at TEXT NOT NULL,
  UNIQUE(comment_id, actor_email, reaction)
);

CREATE INDEX IF NOT EXISTS idx_editorial_comment_reactions_comment_created
  ON editorial_comment_reactions(comment_id, created_at ASC);
