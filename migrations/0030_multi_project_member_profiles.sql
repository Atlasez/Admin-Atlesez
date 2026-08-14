-- プロジェクト横断ポータル用の初期プロジェクトと、プロジェクト別プロフィール。
INSERT OR IGNORE INTO atlasez_projects (id, slug, name, description, created_at)
VALUES (
  'seminar-platform',
  'seminar-platform',
  'ゼミプラットフォーム',
  'ゼミの企画・参加・タスクを管理するプロジェクト',
  '2026-08-14T00:00:00.000Z'
);

-- 既存の運営メンバーは、試験導入するゼミプラットフォームにも参加者として表示する。
-- 今後の追加・削除は大元のプロジェクト管理APIから行う。
INSERT OR IGNORE INTO atlasez_project_memberships (project_id, email, role, joined_at)
SELECT
  'seminar-platform',
  email,
  CASE WHEN subject = '*' THEN 'manager' ELSE 'member' END,
  '2026-08-14T00:00:00.000Z'
FROM report_admin_permissions
WHERE email IS NOT NULL AND trim(email) <> '';

CREATE TABLE IF NOT EXISTS atlasez_project_profiles (
  project_id TEXT NOT NULL REFERENCES atlasez_projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  introduction TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(project_id, email)
);
