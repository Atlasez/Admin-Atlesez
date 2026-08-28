-- 既存のフィードバック依頼も共通タスク一覧へ移行する。
-- 原稿IDはUUIDであるため、既存依頼の移行タスクIDとして安全に再利用できる。
INSERT OR IGNORE INTO editorial_tasks
  (id, project_id, subject, assignee_email, title, details, status,
   created_by, created_at, updated_at, task_kind)
SELECT
  r.document_id,
  'atlas',
  d.subject,
  COALESCE(NULLIF((SELECT GROUP_CONCAT(rr.reviewer_email)
    FROM editorial_review_assignment_recipients rr
    WHERE rr.document_id = r.document_id), ''), r.reviewer_email),
  d.title,
  CASE WHEN NULLIF(TRIM(r.request_note), '') IS NULL
    THEN '記事のフィードバックをお願いします。'
    ELSE r.request_note END,
  'open',
  r.requested_by,
  r.requested_at,
  r.updated_at,
  'feedback'
FROM editorial_review_assignments r
JOIN editorial_documents d ON d.id = r.document_id
WHERE r.task_id IS NULL;

UPDATE editorial_review_assignments
SET task_id = document_id
WHERE task_id IS NULL
  AND EXISTS (SELECT 1 FROM editorial_tasks t WHERE t.id = editorial_review_assignments.document_id);
