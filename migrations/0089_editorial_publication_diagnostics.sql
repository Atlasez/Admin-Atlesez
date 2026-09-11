-- CIの失敗箇所を運営サイト上で修正できるよう、抽出した診断情報を保持する。
ALTER TABLE editorial_publication_runs ADD COLUMN failure_detail TEXT;
ALTER TABLE editorial_publication_runs ADD COLUMN failure_step TEXT;
ALTER TABLE editorial_publication_runs ADD COLUMN failure_file TEXT;
ALTER TABLE editorial_publication_runs ADD COLUMN failure_line INTEGER;
ALTER TABLE editorial_publication_runs ADD COLUMN failure_column INTEGER;
ALTER TABLE editorial_publication_runs ADD COLUMN failure_suggestion TEXT;
