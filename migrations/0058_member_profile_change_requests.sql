-- 大元のメンバー情報は、本人の申請を運営事務局が承認してから反映する。

CREATE TABLE IF NOT EXISTS editorial_member_profile_change_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  proposed_display_name TEXT NOT NULL DEFAULT '',
  proposed_university TEXT NOT NULL DEFAULT '',
  proposed_year TEXT NOT NULL DEFAULT '',
  proposed_affiliation_type TEXT NOT NULL DEFAULT '',
  proposed_country TEXT NOT NULL DEFAULT '',
  proposed_timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  proposed_bio TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  task_id TEXT,
  submitted_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_member_profile_requests_status_submitted
  ON editorial_member_profile_change_requests(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_profile_requests_email_status
  ON editorial_member_profile_change_requests(email, status, submitted_at DESC);
