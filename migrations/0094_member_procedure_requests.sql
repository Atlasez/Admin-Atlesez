-- メンバーからの活動休止・退会申請。申請は保留状態で保存し、運営確認後に処理する。
CREATE TABLE IF NOT EXISTS atlasez_member_procedure_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT 'atlas',
  email TEXT NOT NULL,
  procedure_type TEXT NOT NULL CHECK(procedure_type IN ('pause', 'withdrawal')),
  effective_from TEXT NOT NULL,
  effective_until TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewing','completed','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_member_procedure_requests_email
  ON atlasez_member_procedure_requests(project_id, email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_member_procedure_requests_status
  ON atlasez_member_procedure_requests(project_id, status, created_at DESC);
