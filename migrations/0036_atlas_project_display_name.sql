-- ポータルの参加プロジェクト名を、利用者に役割が伝わる名称へ統一する。
UPDATE atlasez_projects
SET name = 'アトラス学習サイト'
WHERE slug = 'atlas';
