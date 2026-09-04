-- Discordの「運営内運営」ロールだけを、特定メンバーの自動同期から除外する。
-- 運営サイト側の全分野管理者権限は保持したまま、Discord側のロールだけを抑止できる。
CREATE TABLE IF NOT EXISTS atlasez_member_discord_role_sync_exclusions (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  exclude_manager_role INTEGER NOT NULL DEFAULT 0 CHECK(exclude_manager_role IN (0, 1)),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

-- 上杉和輝さんは運営サイトの全分野管理者を維持するが、Discordの
-- 「運営内運営」ロールは付与しない。INSERT OR IGNORE で再適用可能にする。
INSERT OR IGNORE INTO atlasez_member_discord_role_sync_exclusions
  (email, exclude_manager_role, updated_at, updated_by)
VALUES
  ('ukyoukay0@gmail.com', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'migration');
