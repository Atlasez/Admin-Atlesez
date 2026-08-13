CREATE TABLE IF NOT EXISTS atlasez_projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
INSERT OR IGNORE INTO atlasez_projects (id, slug, name, description, created_at)
VALUES ('atlas', 'atlas', 'アトラス', '学習サイト「アトラス」の運営プロジェクト', '2026-08-13T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS atlasez_project_memberships (
  project_id TEXT NOT NULL REFERENCES atlasez_projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL,
  PRIMARY KEY(project_id, email)
);

CREATE TABLE IF NOT EXISTS atlasez_project_todos (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES atlasez_projects(id) ON DELETE CASCADE,
  subject TEXT,
  assignee_email TEXT,
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','doing','done')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_atlasez_project_todos_member ON atlasez_project_todos(project_id, assignee_email, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS atlasez_member_discord_accounts (
  email TEXT PRIMARY KEY,
  discord_user_id TEXT NOT NULL UNIQUE,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS atlasez_discord_role_mappings (
  project_id TEXT NOT NULL REFERENCES atlasez_projects(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  discord_role_id TEXT NOT NULL,
  PRIMARY KEY(project_id, subject)
);

CREATE TABLE IF NOT EXISTS atlasez_member_applications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  interests TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewing','accepted','rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_atlasez_member_applications_status ON atlasez_member_applications(status, created_at DESC);
