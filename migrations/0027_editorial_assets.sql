-- 記事編集ワークスペース用の小さな画像素材。
-- 1ファイルはWorker側で1.5MB以下に制限し、公開時にGitHubのpublic/imagesへ同期する。
CREATE TABLE IF NOT EXISTS editorial_assets (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES editorial_documents(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  bytes INTEGER NOT NULL CHECK (bytes > 0 AND bytes <= 1500000),
  data BLOB NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_editorial_assets_document_created
  ON editorial_assets(document_id, created_at ASC);
