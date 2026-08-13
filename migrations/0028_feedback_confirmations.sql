-- 複数人による確認を、コメント／ToDoごとに記録する。
-- メールアドレスは運営者の権限確認にのみ使い、APIレスポンスでは表示名へ変換する。
CREATE TABLE IF NOT EXISTS editorial_comment_feedback (
  comment_id TEXT NOT NULL REFERENCES editorial_comments(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('confirmed', 'unreflected')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (comment_id, email)
);
CREATE INDEX IF NOT EXISTS idx_editorial_comment_feedback_comment
  ON editorial_comment_feedback(comment_id);

CREATE TABLE IF NOT EXISTS editorial_task_feedback (
  task_id TEXT NOT NULL REFERENCES editorial_tasks(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('confirmed', 'unreflected')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (task_id, email)
);
CREATE INDEX IF NOT EXISTS idx_editorial_task_feedback_task
  ON editorial_task_feedback(task_id);
