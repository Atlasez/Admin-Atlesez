CREATE TABLE IF NOT EXISTS atlasez_application_rate_limits (
  client_key TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (client_key, bucket)
);

CREATE TABLE IF NOT EXISTS atlasez_discord_channel_mappings (
  project_id TEXT NOT NULL REFERENCES atlasez_projects(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  discord_channel_id TEXT NOT NULL,
  PRIMARY KEY(project_id, subject)
);
