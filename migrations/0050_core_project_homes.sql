-- Core project homes are part of the admin navigation, so they must exist in
-- D1 even when the project was not created through the admin UI yet.
INSERT OR IGNORE INTO atlasez_projects (id, slug, name, description, created_at)
VALUES
  ('secretariat', 'secretariat', 'Atlasez運営事務局', 'Atlasez全体の運営事務局プロジェクト', '2026-08-17T00:00:00.000Z'),
  ('semi-platform', 'semi-platform', 'ゼミプラットフォーム', 'ゼミプラットフォームの運営プロジェクト', '2026-08-17T00:00:00.000Z');
