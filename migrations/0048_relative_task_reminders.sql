-- ToDoリマインダーを期限基準の相対指定として保存する。
-- 既存の絶対日時リマインダーは relative_kind='absolute' のまま互換維持する。
ALTER TABLE editorial_task_reminders ADD COLUMN relative_kind TEXT NOT NULL DEFAULT 'absolute';
ALTER TABLE editorial_task_reminders ADD COLUMN relative_amount INTEGER;
ALTER TABLE editorial_task_reminders ADD COLUMN relative_unit TEXT;
ALTER TABLE editorial_task_reminders ADD COLUMN relative_start TEXT;
