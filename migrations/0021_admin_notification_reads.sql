-- 通知は運営者ごとに既読状態を保持する。通知自体は現在のToDo・査読依頼から都度生成する。
CREATE TABLE IF NOT EXISTS admin_notification_reads (
  email TEXT NOT NULL,
  notification_id TEXT NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY (email, notification_id)
);
