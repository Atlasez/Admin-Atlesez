-- プロジェクト別の応募フォームと、フォーム固有の回答を保存する。
ALTER TABLE atlasez_member_applications ADD COLUMN project_slug TEXT NOT NULL DEFAULT 'atlas';
ALTER TABLE atlasez_member_applications ADD COLUMN project_answers TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_atlasez_member_applications_project
  ON atlasez_member_applications(project_slug, status, created_at DESC);

-- 公開フォームに対応するプロジェクトを、管理画面のプロジェクト一覧にも登録する。
INSERT OR IGNORE INTO atlasez_projects (id, slug, name, description, created_at)
VALUES
  ('thinking-cafe', 'thinking-cafe', '考えるカフェ', '考えるカフェの運営プロジェクト', '2026-08-24T00:00:00.000Z'),
  ('student-council-exchange', 'student-council-exchange', '日本生徒会協会', '日本生徒会協会の運営プロジェクト', '2026-08-24T00:00:00.000Z');
