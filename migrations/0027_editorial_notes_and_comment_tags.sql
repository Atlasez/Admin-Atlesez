-- 原稿ごとの執筆意図メモと、査読コメントの分類タグ。
-- どちらも運営用D1だけに保存し、学習サイトへは公開しない。
ALTER TABLE editorial_documents
  ADD COLUMN editorial_note TEXT NOT NULL DEFAULT '';

ALTER TABLE editorial_comments
  ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
