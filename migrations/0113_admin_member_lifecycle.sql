-- 運営メンバーのアーカイブ状態と、復元に必要な運用スコープの退避。
-- プロフィール、応募、記事、監査ログ、Discordアカウント本体は削除しない。
CREATE TABLE IF NOT EXISTS admin_member_lifecycle (
  email TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  archived_by TEXT,
  archived_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_member_lifecycle_status
  ON admin_member_lifecycle(status, updated_at DESC);
