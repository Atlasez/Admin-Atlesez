-- 目次項目の階層と運営原稿の紐付きを永続化する。
ALTER TABLE editorial_outline_entries ADD COLUMN parent_id TEXT REFERENCES editorial_outline_entries(id) ON DELETE SET NULL;
ALTER TABLE editorial_outline_entries ADD COLUMN document_id TEXT REFERENCES editorial_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_editorial_outline_entries_parent
  ON editorial_outline_entries(project_id, parent_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_editorial_outline_entries_document
  ON editorial_outline_entries(document_id);

-- 既存の運営原稿も識別子で一度だけ自動連携する。
UPDATE editorial_outline_entries
   SET document_id = (
     SELECT d.id
       FROM editorial_documents d
      WHERE d.subject = editorial_outline_entries.subject_slug
        AND d.category = editorial_outline_entries.category_slug
        AND d.slug = editorial_outline_entries.slug
      ORDER BY d.updated_at DESC
      LIMIT 1
   )
 WHERE document_id IS NULL;
