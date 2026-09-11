-- The editor advertises SVG uploads and validates safe SVG content in the
-- Worker, but the original table constraint only allowed raster formats.
-- Rebuild the table so existing assets and the latex_name index survive while
-- bringing the D1 constraint in line with the upload API.
PRAGMA foreign_keys = OFF;

CREATE TABLE editorial_assets_svg_new (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES editorial_documents(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml')),
  bytes INTEGER NOT NULL CHECK (bytes > 0 AND bytes <= 1500000),
  data BLOB NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  latex_name TEXT NOT NULL DEFAULT ''
);

INSERT INTO editorial_assets_svg_new
  (id, document_id, filename, media_type, bytes, data, alt_text, created_by, created_at, latex_name)
SELECT id, document_id, filename, media_type, bytes, data, alt_text, created_by, created_at, latex_name
FROM editorial_assets;

DROP TABLE editorial_assets;
ALTER TABLE editorial_assets_svg_new RENAME TO editorial_assets;

CREATE INDEX idx_editorial_assets_document_created
  ON editorial_assets(document_id, created_at ASC);

CREATE UNIQUE INDEX editorial_assets_document_latex_name
  ON editorial_assets (document_id, lower(latex_name))
  WHERE latex_name <> '';

PRAGMA foreign_keys = ON;
