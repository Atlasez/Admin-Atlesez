-- 運営資料ライブラリ。実ファイルはR2、資料の分類・権限・履歴はD1で管理する。
CREATE TABLE IF NOT EXISTS material_collections (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT 'atlas',
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_url TEXT,
  source_folder_id TEXT,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  imported_at TEXT
);

CREATE TABLE IF NOT EXISTS material_items (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  parent_path TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_key TEXT,
  source_drive_id TEXT,
  source_url TEXT,
  checksum TEXT,
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready', 'importing', 'failed', 'archived')),
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(collection_id) REFERENCES material_collections(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_material_items_collection_drive
  ON material_items(collection_id, source_drive_id)
  WHERE source_drive_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_material_items_collection_updated
  ON material_items(collection_id, updated_at DESC);

-- 最初の試験対象。実ファイルの取り込みは、R2とGoogle Driveの移行権限を有効にした後に行う。
INSERT OR IGNORE INTO material_collections (
  id, project_id, slug, title, description, source_type, source_url, source_folder_id,
  created_by, created_at, updated_at
) VALUES (
  'drive-shared-materials', 'atlas', 'shared-materials', '共有資料（試験移行）',
  '既存の分野別Google Drive資料を、R2へ安全に移すための試験用コレクションです。',
  'google-drive', 'https://drive.google.com/drive/folders/1UQAdXMwzOBilPx7JLtTj2-711bIYTu61', '1UQAdXMwzOBilPx7JLtTj2-711bIYTu61',
  'system', datetime('now'), datetime('now')
);
