-- Three UUIDv4 documents adopted by the old public-article import flow.
-- Provenance: scripts/editorial-legacy-imports.json and the published Git sources.
-- Only authorship metadata changes; all actor fields and article data remain.
UPDATE editorial_documents
SET creator_kind = 'organization'
WHERE document_kind = 'canonical'
  AND (
    (id = 'd6ff9e83-7f01-4734-bffe-6b94b52b0d06' AND source_article_id = 'ja-mathematics-ring-definition' AND created_at = '2026-08-31T14:11:37.499Z')
    OR (id = '403ffac6-4b84-410d-957f-038b416d6f59' AND source_article_id = 'ja-physics-conservation-of-momentum' AND created_at = '2026-08-31T14:25:55.830Z')
    OR (id = 'd00e20a1-1dd8-4bcb-99a7-13ee9bf780e8' AND source_article_id = 'ja-mathematics-homomorphism-theorem' AND created_at = '2026-08-31T14:28:55.513Z')
  );
