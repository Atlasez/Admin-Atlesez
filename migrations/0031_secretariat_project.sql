-- Atlasez全体を支える運営事務局を、他のプロジェクトと同じポータル単位で管理する。
INSERT OR IGNORE INTO atlasez_projects (id, slug, name, description, created_at)
VALUES (
  'secretariat',
  'secretariat',
  'Atlasez運営事務局',
  'Atlasez全体の広報・メンバーサポート・企画を管理するプロジェクト',
  '2026-08-15T00:00:00.000Z'
);

INSERT OR IGNORE INTO atlasez_project_memberships (project_id, email, role, joined_at)
SELECT
  'secretariat',
  email,
  CASE WHEN subject = '*' THEN 'manager' ELSE 'member' END,
  '2026-08-15T00:00:00.000Z'
FROM report_admin_permissions
WHERE email IS NOT NULL AND trim(email) <> '';
