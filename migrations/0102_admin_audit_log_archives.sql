-- 監査ログは物理削除せず、保持期限を超えた行をアーカイブ扱いにする。
-- アーカイブ済みの証跡も必要に応じて確認できるよう、archived_atだけを付与する。
ALTER TABLE admin_audit_log ADD COLUMN archived_at TEXT;
ALTER TABLE admin_permission_audit_log ADD COLUMN archived_at TEXT;

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_archive
  ON admin_audit_log(archived_at, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_permission_audit_archive
  ON admin_permission_audit_log(archived_at, created_at DESC, id DESC);
