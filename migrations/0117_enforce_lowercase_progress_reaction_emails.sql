-- 0111 creates the original table; 0116 is a no-op on databases where 0111
-- already ran. Rebuild the table so existing databases also enforce the
-- lowercase actor-email invariant without discarding reaction rows.
CREATE TABLE editorial_progress_reactions_rebuild (
  id TEXT PRIMARY KEY,
  progress_id TEXT NOT NULL REFERENCES editorial_progress_reports(id) ON DELETE CASCADE,
  actor_email TEXT NOT NULL CHECK(actor_email = lower(actor_email)),
  reaction TEXT NOT NULL DEFAULT 'like' CHECK(reaction = 'like'),
  created_at TEXT NOT NULL,
  UNIQUE(progress_id, actor_email, reaction)
);

INSERT INTO editorial_progress_reactions_rebuild (
  id,
  progress_id,
  actor_email,
  reaction,
  created_at
)
SELECT id, progress_id, lower(actor_email), reaction, created_at
FROM editorial_progress_reactions;

DROP TABLE editorial_progress_reactions;
ALTER TABLE editorial_progress_reactions_rebuild
  RENAME TO editorial_progress_reactions;

CREATE INDEX idx_editorial_progress_reactions_progress_created
  ON editorial_progress_reactions(progress_id, created_at ASC);
