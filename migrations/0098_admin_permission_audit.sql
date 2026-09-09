-- 権限変更の監査履歴。対象者のアクセス範囲を変更したときだけ記録する。
CREATE TABLE IF NOT EXISTS admin_permission_audit_log (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  target_email TEXT NOT NULL,
  action TEXT NOT NULL,
  before_subjects TEXT NOT NULL DEFAULT '',
  after_subjects TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_permission_audit_created
  ON admin_permission_audit_log(created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_admin_permission_audit_target
  ON admin_permission_audit_log(target_email, created_at DESC);
