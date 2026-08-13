-- 運営の個人情報・進捗・タスク・日程調整を、Googleログインのメールアドレス単位で保持する。
CREATE TABLE IF NOT EXISTS editorial_member_profiles (
  email TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  availability_note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS editorial_progress_reports (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  subject TEXT,
  document_id TEXT REFERENCES editorial_documents(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_editorial_progress_reports_email_created ON editorial_progress_reports(email, created_at DESC);

CREATE TABLE IF NOT EXISTS editorial_tasks (
  id TEXT PRIMARY KEY,
  subject TEXT,
  assignee_email TEXT,
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','doing','done')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_editorial_tasks_subject_status ON editorial_tasks(subject, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_editorial_tasks_assignee_status ON editorial_tasks(assignee_email, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS editorial_events (
  id TEXT PRIMARY KEY,
  subject TEXT,
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_editorial_events_start ON editorial_events(starts_at ASC);

CREATE TABLE IF NOT EXISTS editorial_event_availability (
  event_id TEXT NOT NULL REFERENCES editorial_events(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  availability TEXT NOT NULL CHECK(availability IN ('available','maybe','unavailable')),
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(event_id, email)
);
