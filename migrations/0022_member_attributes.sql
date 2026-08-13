-- 運営者プロフィールの所属・学年・関心分野とDiscordロール対応を保持する。
ALTER TABLE editorial_member_profiles ADD COLUMN university TEXT NOT NULL DEFAULT '';
ALTER TABLE editorial_member_profiles ADD COLUMN year TEXT NOT NULL DEFAULT '';
ALTER TABLE editorial_member_profiles ADD COLUMN interests TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS atlasez_discord_attribute_role_mappings (
  attribute_type TEXT NOT NULL CHECK(attribute_type IN ('university','year','interest')),
  attribute_value TEXT NOT NULL,
  discord_role_id TEXT NOT NULL,
  PRIMARY KEY(attribute_type, attribute_value)
);
