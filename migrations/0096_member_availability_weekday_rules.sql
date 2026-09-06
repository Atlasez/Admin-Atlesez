-- メンバーが毎週の曜日単位で登録する参加可否。日付単位の期間とは分離して保持する。
CREATE TABLE IF NOT EXISTS editorial_member_availability_rules (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  label TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'unavailable' CHECK(kind IN ('available','unavailable')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_editorial_member_availability_rules_email_weekday
  ON editorial_member_availability_rules(email, weekday);
