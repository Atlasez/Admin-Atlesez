-- 個人の再利用可能な参考文献リスト。
ALTER TABLE editorial_personal_workspaces
  ADD COLUMN personal_references TEXT NOT NULL DEFAULT '[]';

-- 本文から引用した参考文献は記事にコピーして保存する。
ALTER TABLE editorial_documents
  ADD COLUMN article_references TEXT NOT NULL DEFAULT '[]';
