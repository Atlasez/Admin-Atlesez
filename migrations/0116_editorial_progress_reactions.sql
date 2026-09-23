CREATE TABLE IF NOT EXISTS editorial_progress_reactions (
  report_id TEXT NOT NULL REFERENCES editorial_progress_reports(id) ON DELETE CASCADE,
  actor_email TEXT NOT NULL CHECK(actor_email = lower(actor_email)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (report_id, actor_email)
);

CREATE INDEX IF NOT EXISTS idx_editorial_progress_reactions_report
  ON editorial_progress_reactions(report_id, created_at);
