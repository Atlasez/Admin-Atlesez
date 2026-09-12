-- Keep an explicit last editor for subject/category catalog entries.
-- Existing rows are attributed to their original creator when this migration runs.
ALTER TABLE admin_editorial_taxonomy_catalog
  ADD COLUMN updated_by TEXT NOT NULL DEFAULT '';

UPDATE admin_editorial_taxonomy_catalog
SET updated_by = created_by
WHERE updated_by = '';
