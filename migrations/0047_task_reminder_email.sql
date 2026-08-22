-- リマインダーの送信先をToDoごとに明示できるようにする。
-- 空欄の場合はメール送信せず、運営サイトの通知ベルに表示する。
ALTER TABLE editorial_tasks ADD COLUMN reminder_email TEXT;
