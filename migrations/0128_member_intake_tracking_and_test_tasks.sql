-- 応募レコードの保持期限から独立したプロジェクト別の受入フォロー記録。
-- application_idは監査参照のみでFKを設けず、応募削除後も記録を保持する。
CREATE TABLE IF NOT EXISTS editorial_member_intake_tracking (
  project_id TEXT NOT NULL,
  email TEXT NOT NULL,
  application_id TEXT,
  responsible_email TEXT NOT NULL DEFAULT '',
  consultation_email TEXT NOT NULL DEFAULT '',
  contact_status TEXT NOT NULL DEFAULT 'not_contacted'
    CHECK(contact_status IN ('not_contacted','contacted','replied')),
  contact_note TEXT NOT NULL DEFAULT '',
  contacted_at TEXT,
  first_task_id TEXT,
  first_task_title TEXT NOT NULL DEFAULT '',
  first_task_type TEXT NOT NULL DEFAULT 'member' CHECK(first_task_type IN ('member','operator')),
  follow_up_at TEXT,
  follow_up_completed_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  PRIMARY KEY(project_id,email)
);

CREATE INDEX IF NOT EXISTS idx_member_intake_follow_up
  ON editorial_member_intake_tracking(project_id,follow_up_at,follow_up_completed_at);

ALTER TABLE editorial_tasks ADD COLUMN is_test_data INTEGER NOT NULL DEFAULT 0
  CHECK(is_test_data IN (0,1));

CREATE INDEX IF NOT EXISTS idx_editorial_tasks_test_data
  ON editorial_tasks(project_id,is_test_data,status,updated_at DESC);
