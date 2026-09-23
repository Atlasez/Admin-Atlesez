CREATE TABLE IF NOT EXISTS editorial_progress_reactions (
  id TEXT PRIMARY KEY,
  progress_id TEXT NOT NULL REFERENCES editorial_progress_reports(id) ON DELETE CASCADE,
  actor_email TEXT NOT NULL CHECK(actor_email = lower(actor_email)),
  reaction TEXT NOT NULL DEFAULT 'like' CHECK(reaction = 'like'),
  created_at TEXT NOT NULL,
  UNIQUE(progress_id, actor_email, reaction)
);

CREATE INDEX IF NOT EXISTS idx_editorial_progress_reactions_progress_created
  ON editorial_progress_reactions(progress_id, created_at ASC);
