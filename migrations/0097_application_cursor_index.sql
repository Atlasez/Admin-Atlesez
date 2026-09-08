-- 応募管理の作成日時カーソルページングを、プロジェクト単位で効率よく実行する。
CREATE INDEX IF NOT EXISTS idx_atlasez_member_applications_project_created
  ON atlasez_member_applications(project_slug, created_at DESC, id DESC);
