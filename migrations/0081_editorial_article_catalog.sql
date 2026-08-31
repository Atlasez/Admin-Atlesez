-- GitHub/学習サイトの公開記事と運営原稿を結びつける記事カタログ。
-- 既存の editorial_documents は削除・統合せず、重複があっても
-- カタログ側の代表紐付けだけを保持して検出可能にする。
CREATE TABLE IF NOT EXISTS editorial_article_catalog (
  path TEXT PRIMARY KEY,
  identity_key TEXT NOT NULL UNIQUE,
  repository TEXT NOT NULL,
  locale TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  slug TEXT NOT NULL,
  source_article_id TEXT,
  git_sha TEXT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  concept_id TEXT NOT NULL DEFAULT '',
  public_status TEXT NOT NULL DEFAULT 'published',
  document_id TEXT REFERENCES editorial_documents(id) ON DELETE SET NULL,
  last_seen_at TEXT NOT NULL,
  registered_at TEXT,
  registered_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_editorial_article_catalog_document
  ON editorial_article_catalog(document_id);
CREATE INDEX IF NOT EXISTS idx_editorial_article_catalog_source_article
  ON editorial_article_catalog(source_article_id);
CREATE INDEX IF NOT EXISTS idx_editorial_article_catalog_subject
  ON editorial_article_catalog(subject, category, locale);

-- 既存原稿はそのまま残し、同一公開パスに複数ある場合も削除しない。
-- 公開済み・更新日時の新しい原稿を代表紐付けとして先に登録する。
INSERT OR IGNORE INTO editorial_article_catalog
  (path, identity_key, repository, locale, subject, category, slug,
   source_article_id, title, concept_id, public_status, document_id,
   last_seen_at, registered_at, registered_by)
SELECT
  'src/content/articles/' || locale || '/' || subject || '/' || category || '/' || slug || '.md',
  locale || '/' || subject || '/' || category || '/' || slug,
  'Atlasez/Atlasez01', locale, subject, category, slug,
  source_article_id, title, concept_id, 'editorial-only', id,
  COALESCE(updated_at, created_at), created_at, created_by
FROM editorial_documents
ORDER BY CASE WHEN published_at IS NOT NULL THEN 0 ELSE 1 END,
         updated_at DESC, id;

-- 既存重複を削除せず、migration後の新規重複だけをDBでも拒否する。
-- 既存データの整理は別途、重複候補を確認してから行う。
CREATE TRIGGER IF NOT EXISTS editorial_documents_identity_insert
BEFORE INSERT ON editorial_documents
WHEN EXISTS (
  SELECT 1 FROM editorial_documents
  WHERE locale = NEW.locale
    AND subject = NEW.subject
    AND category = NEW.category
    AND slug = NEW.slug
)
BEGIN
  SELECT RAISE(ABORT, 'duplicate editorial document identity');
END;

CREATE TRIGGER IF NOT EXISTS editorial_documents_identity_update
BEFORE UPDATE OF locale, subject, category, slug ON editorial_documents
WHEN (NEW.locale != OLD.locale
   OR NEW.subject != OLD.subject
   OR NEW.category != OLD.category
   OR NEW.slug != OLD.slug)
 AND EXISTS (
  SELECT 1 FROM editorial_documents
  WHERE id != OLD.id
    AND locale = NEW.locale
    AND subject = NEW.subject
    AND category = NEW.category
    AND slug = NEW.slug
)
BEGIN
  SELECT RAISE(ABORT, 'duplicate editorial document identity');
END;

CREATE TRIGGER IF NOT EXISTS editorial_documents_source_article_insert
BEFORE INSERT ON editorial_documents
WHEN NEW.source_article_id IS NOT NULL
 AND EXISTS (
   SELECT 1 FROM editorial_documents
   WHERE source_article_id = NEW.source_article_id
 )
BEGIN
  SELECT RAISE(ABORT, 'duplicate editorial source article');
END;

CREATE TRIGGER IF NOT EXISTS editorial_documents_source_article_update
BEFORE UPDATE OF source_article_id ON editorial_documents
WHEN NEW.source_article_id IS NOT NULL
 AND NEW.source_article_id IS NOT OLD.source_article_id
 AND EXISTS (
   SELECT 1 FROM editorial_documents
   WHERE id != OLD.id
     AND source_article_id = NEW.source_article_id
 )
BEGIN
  SELECT RAISE(ABORT, 'duplicate editorial source article');
END;
