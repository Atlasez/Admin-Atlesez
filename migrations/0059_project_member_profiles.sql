-- 運営内自己紹介は大元の共通プロフィールから分離し、プロジェクト単位で承認する。

CREATE TABLE IF NOT EXISTS editorial_project_member_profiles (
  project_id TEXT NOT NULL REFERENCES atlasez_projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  internal_bio TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, email)
);

CREATE TABLE IF NOT EXISTS editorial_project_profile_change_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES atlasez_projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  proposed_internal_bio TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  task_id TEXT,
  submitted_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_project_profiles_project_updated
  ON editorial_project_member_profiles(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_profile_requests_project_status
  ON editorial_project_profile_change_requests(project_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_profile_requests_member_status
  ON editorial_project_profile_change_requests(project_id, email, status, submitted_at DESC);
