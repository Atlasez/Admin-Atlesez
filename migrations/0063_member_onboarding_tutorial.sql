-- プロフィール入力後の必須ガイド進捗。プロジェクトごとに再開できるようにする。
CREATE TABLE IF NOT EXISTS atlasez_member_onboarding_progress (
  project_id TEXT NOT NULL REFERENCES atlasez_projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  profile_completed_at TEXT NOT NULL,
  tutorial_step INTEGER NOT NULL DEFAULT 0 CHECK(tutorial_step >= 0),
  tutorial_completed_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, email)
);

CREATE INDEX IF NOT EXISTS idx_member_onboarding_progress_email
  ON atlasez_member_onboarding_progress(email, updated_at DESC);
