-- 参加者・タスク・日程のない旧重複レコードだけを削除する。
-- 参加者4名が存在する正規レコード seminar-platform は保持する。
DELETE FROM atlasez_projects
WHERE id = 'semi-platform'
  AND slug = 'semi-platform'
  AND NOT EXISTS (
    SELECT 1 FROM atlasez_project_memberships
    WHERE project_id = 'semi-platform'
  )
  AND NOT EXISTS (
    SELECT 1 FROM editorial_tasks
    WHERE project_id = 'semi-platform'
  )
  AND NOT EXISTS (
    SELECT 1 FROM editorial_events
    WHERE project_id = 'semi-platform'
  );
