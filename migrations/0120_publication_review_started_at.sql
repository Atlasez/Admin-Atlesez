-- updated_atは本文保存でも変わるため、現在の審査段階の開始時刻を別に保持する。
-- 既存審査の正確な開始時刻は推測せずNULL（開始日時未記録）とする。
ALTER TABLE editorial_documents ADD COLUMN publication_review_started_at TEXT;
