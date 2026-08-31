-- 記事編集ワークスペースから新しい学習地図概念を公開PRへ追加するための情報。
ALTER TABLE editorial_documents ADD COLUMN concept_name TEXT;
ALTER TABLE editorial_documents ADD COLUMN concept_name_en TEXT;
ALTER TABLE editorial_documents ADD COLUMN concept_is_new INTEGER NOT NULL DEFAULT 0 CHECK (concept_is_new IN (0, 1));
