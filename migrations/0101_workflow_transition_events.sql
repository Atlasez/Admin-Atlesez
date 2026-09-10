-- 状態遷移を一元管理するためのイベント台帳。
-- idempotency_key は同じ操作者による二重送信を1回に収束させる。
CREATE TABLE IF NOT EXISTS workflow_transition_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  expected_updated_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_transition_idempotency
  ON workflow_transition_events(actor_email, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_workflow_transition_entity
  ON workflow_transition_events(entity_type, entity_id, created_at DESC);
