-- Googleログインのメールアドレスごとに保存する、本人専用の運営メモ。
-- 記事原稿・査読コメントとは分離し、ほかの運営者からは取得できない。
CREATE TABLE IF NOT EXISTS editorial_personal_workspaces (
  email TEXT PRIMARY KEY,
  private_note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
