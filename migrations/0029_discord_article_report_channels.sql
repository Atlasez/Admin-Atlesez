-- 進捗通知用チャンネルと、読者からの記事問題報告用チャンネルを分離する。
CREATE TABLE IF NOT EXISTS atlasez_discord_report_channel_mappings (
  project_id TEXT NOT NULL REFERENCES atlasez_projects(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  discord_channel_id TEXT NOT NULL,
  PRIMARY KEY(project_id, subject)
);
