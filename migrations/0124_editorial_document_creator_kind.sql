-- Separate article authorship from the person who registered the document.
-- created_by/updated_by and catalog registered_by remain operational audit data.
ALTER TABLE editorial_documents
  ADD COLUMN creator_kind TEXT NOT NULL DEFAULT 'person'
  CHECK (creator_kind IN ('person', 'organization'));

-- Only catalog adoption creates these deterministic UUIDv5-shaped canonical IDs.
-- Before remote application, verify every candidate's full SHA-256-derived ID
-- with scripts/verify-editorial-creator-backfill.mjs against a verified D1 export.
-- UUIDv4 personal drafts, update proposals and link-only registrations are excluded.
UPDATE editorial_documents
SET creator_kind = 'organization'
WHERE document_kind = 'canonical'
  AND source_article_id IS NOT NULL
  AND substr(id, 15, 1) = '5'
  AND substr(id, 20, 1) IN ('8', '9', 'a', 'b')
  AND EXISTS (
    SELECT 1 FROM editorial_article_catalog c
    WHERE c.document_id = editorial_documents.id
      AND c.source_article_id = editorial_documents.source_article_id
  );
