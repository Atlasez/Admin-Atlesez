-- 公開済みかどうかを原稿単位で記録し、公開取り消しを安全に行う。
ALTER TABLE editorial_documents ADD COLUMN published_at TEXT;

-- この列を追加する前に承認済みだった既存原稿は、従来フローで公開済みとして扱う。
UPDATE editorial_documents
SET published_at = COALESCE(reviewed_at, updated_at)
WHERE status = 'approved' AND published_at IS NULL;
