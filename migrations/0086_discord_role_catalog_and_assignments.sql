-- Discordの既存ロールを運営サイト側で選択・管理するためのカタログ。
-- このテーブルはDiscordのロール定義を複製するだけで、Discord側の定義は変更しない。
CREATE TABLE IF NOT EXISTS atlasez_discord_role_catalog (
  discord_role_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_managed INTEGER NOT NULL DEFAULT 0 CHECK(is_managed IN (0, 1)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_atlasez_discord_role_catalog_guild
  ON atlasez_discord_role_catalog(guild_id, position DESC, name);

-- 運営サイト上で明示的に選択した、メンバーへの既存Discordロール割当。
-- is_active=0 の行も残し、選択解除したロールを次回同期で安全に削除できるようにする。
CREATE TABLE IF NOT EXISTS atlasez_member_discord_role_assignments (
  email TEXT NOT NULL COLLATE NOCASE,
  discord_role_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  assigned_at TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  PRIMARY KEY(email, discord_role_id)
);
CREATE INDEX IF NOT EXISTS idx_atlasez_member_discord_role_assignments_email
  ON atlasez_member_discord_role_assignments(email, is_active);
