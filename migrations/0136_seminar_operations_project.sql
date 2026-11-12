-- Preserve an existing project and its memberships under either project ID.
INSERT INTO atlasez_projects (id, slug, name, description, created_at)
SELECT 'seminar-platform', 'seminar-platform', 'ゼミプラットフォーム',
       'ゼミプラットフォームの運営プロジェクト', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (
  SELECT 1 FROM atlasez_projects
  WHERE id IN ('seminar-platform', 'semi-platform')
     OR slug IN ('seminar-platform', 'semi-platform')
);
