-- フィードバック依頼を通常のタスクとして複数回記録し、記事ごとの履歴を保持する。
-- editorial_review_assignments は一覧・既存導線との互換のため、最新依頼だけを保持する。
CREATE TABLE IF NOT EXISTS editorial_feedback_task_links (
  task_id TEXT PRIMARY KEY REFERENCES editorial_tasks(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES editorial_documents(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_editorial_feedback_task_links_document
  ON editorial_feedback_task_links(document_id, created_at DESC);

-- 既に共通タスクへ移行済みの依頼を履歴にも引き継ぐ。
INSERT OR IGNORE INTO editorial_feedback_task_links (task_id, document_id, created_at)
SELECT r.task_id, r.document_id, r.requested_at
FROM editorial_review_assignments r
JOIN editorial_tasks t ON t.id = r.task_id AND t.task_kind = 'feedback'
WHERE r.task_id IS NOT NULL;
