-- Keep a published editorial document immutable while an update is reviewed.
-- Update proposals are ordinary editorial documents with their own comments,
-- review state, and publication run, linked back to the published source.
ALTER TABLE editorial_documents ADD COLUMN document_kind TEXT NOT NULL DEFAULT 'canonical'
  CHECK (document_kind IN ('canonical', 'update-proposal'));
ALTER TABLE editorial_documents ADD COLUMN base_document_id TEXT REFERENCES editorial_documents(id);
ALTER TABLE editorial_documents ADD COLUMN base_document_updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_editorial_documents_base_proposal
  ON editorial_documents(base_document_id, archived_at, updated_at DESC);

-- Existing rows are the canonical source documents.  The explicit update also
-- makes the migration safe on adapters that do not preserve ALTER defaults.
UPDATE editorial_documents SET document_kind = 'canonical' WHERE document_kind IS NULL;
