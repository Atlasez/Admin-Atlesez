-- 公開runで発生した複数の失敗要因を時系列で追跡する。
ALTER TABLE editorial_publication_runs ADD COLUMN failure_history TEXT NOT NULL DEFAULT '[]';
