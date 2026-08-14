-- 旧形式の問題報告に残る空の更新日時を受信日時で補完する。
-- 管理画面は不正値にもフォールバックするが、保存データも正規化しておく。
UPDATE article_reports
SET updated_at = created_at
WHERE updated_at IS NULL OR trim(updated_at) = '';
