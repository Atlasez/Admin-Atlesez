-- 公開原稿の更新案は、公開中の原稿と同じ記事識別子・source_article_idを
-- 引き継いだ独立した下書きとして保存する。既存の重複防止トリガーは
-- canonical 原稿同士の重複だけを拒否し、更新案は base_document_id で
-- 一意性を管理する。
DROP TRIGGER IF EXISTS editorial_documents_identity_insert;
DROP TRIGGER IF EXISTS editorial_documents_identity_update;
DROP TRIGGER IF EXISTS editorial_documents_source_article_insert;
DROP TRIGGER IF EXISTS editorial_documents_source_article_update;

CREATE TRIGGER editorial_documents_identity_insert
BEFORE INSERT ON editorial_documents
WHEN COALESCE(NEW.document_kind, 'canonical') = 'canonical'
 AND EXISTS (
  SELECT 1 FROM editorial_documents
  WHERE locale = NEW.locale
    AND subject = NEW.subject
    AND category = NEW.category
    AND slug = NEW.slug
    AND COALESCE(document_kind, 'canonical') = 'canonical'
 )
BEGIN
  SELECT RAISE(ABORT, 'duplicate editorial document identity');
END;

CREATE TRIGGER editorial_documents_identity_update
BEFORE UPDATE OF locale, subject, category, slug ON editorial_documents
WHEN COALESCE(NEW.document_kind, 'canonical') = 'canonical'
 AND (NEW.locale != OLD.locale
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
    AND COALESCE(document_kind, 'canonical') = 'canonical'
 )
BEGIN
  SELECT RAISE(ABORT, 'duplicate editorial document identity');
END;

CREATE TRIGGER editorial_documents_source_article_insert
BEFORE INSERT ON editorial_documents
WHEN COALESCE(NEW.document_kind, 'canonical') = 'canonical'
 AND NEW.source_article_id IS NOT NULL
 AND EXISTS (
  SELECT 1 FROM editorial_documents
  WHERE source_article_id = NEW.source_article_id
    AND COALESCE(document_kind, 'canonical') = 'canonical'
 )
BEGIN
  SELECT RAISE(ABORT, 'duplicate editorial source article');
END;

CREATE TRIGGER editorial_documents_source_article_update
BEFORE UPDATE OF source_article_id ON editorial_documents
WHEN COALESCE(NEW.document_kind, 'canonical') = 'canonical'
 AND NEW.source_article_id IS NOT NULL
 AND NEW.source_article_id IS NOT OLD.source_article_id
 AND EXISTS (
  SELECT 1 FROM editorial_documents
  WHERE id != OLD.id
    AND source_article_id = NEW.source_article_id
    AND COALESCE(document_kind, 'canonical') = 'canonical'
 )
BEGIN
  SELECT RAISE(ABORT, 'duplicate editorial source article');
END;
