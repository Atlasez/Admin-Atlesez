-- 確定済み本文の編集ロック範囲を記事ごとに保存する。
ALTER TABLE editorial_documents
  ADD COLUMN locked_ranges TEXT NOT NULL DEFAULT '[]';
