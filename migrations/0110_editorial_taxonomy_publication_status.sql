-- Separate catalog lifecycle (active/archived) from public visibility.
ALTER TABLE admin_editorial_taxonomy_catalog
  ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'preparing'
  CHECK(publication_status IN ('preparing', 'published'));

-- Entries bootstrapped from the existing learning site are already public.
UPDATE admin_editorial_taxonomy_catalog
SET publication_status = 'published'
WHERE created_by = 'system';
