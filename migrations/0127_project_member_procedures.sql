-- Preserve every existing request while extending the review and application lifecycle.
ALTER TABLE atlasez_member_procedure_requests RENAME TO atlasez_member_procedure_requests_legacy;
CREATE TABLE atlasez_member_procedure_requests (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL,
 procedure_type TEXT NOT NULL CHECK(procedure_type IN ('pause','withdrawal','restart')),
 effective_from TEXT NOT NULL, effective_until TEXT NOT NULL DEFAULT '',
 timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo', effective_at TEXT,
 reason TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewing','completed','cancelled','scheduled','applied','rejected')),
 execution_error TEXT NOT NULL DEFAULT '',
 review_note TEXT NOT NULL DEFAULT '', handover_note TEXT NOT NULL DEFAULT '',
 reviewed_by TEXT, reviewed_at TEXT, applied_at TEXT,
 expected_state TEXT NOT NULL DEFAULT 'active' CHECK(expected_state IN ('active','paused','withdrawn')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
INSERT INTO atlasez_member_procedure_requests
 (id,project_id,email,procedure_type,effective_from,effective_until,reason,note,status,created_at,updated_at)
 SELECT id,project_id,email,procedure_type,effective_from,effective_until,reason,note,status,created_at,updated_at
 FROM atlasez_member_procedure_requests_legacy;
DROP TABLE atlasez_member_procedure_requests_legacy;
CREATE INDEX idx_member_procedure_requests_email ON atlasez_member_procedure_requests(project_id,email,created_at DESC);
CREATE INDEX idx_member_procedure_requests_status ON atlasez_member_procedure_requests(project_id,status,created_at DESC);
CREATE INDEX idx_member_procedure_requests_schedule ON atlasez_member_procedure_requests(status,effective_at);
CREATE TABLE atlasez_project_member_lifecycle (
 project_id TEXT NOT NULL REFERENCES atlasez_projects(id), email TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('active','paused','withdrawn')),
 role_snapshot TEXT NOT NULL, last_request_id TEXT NOT NULL,
 updated_at TEXT NOT NULL, PRIMARY KEY(project_id,email)
);
