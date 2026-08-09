-- 記事ごとの問題報告を担当分野へ振り分けるための分類情報。
ALTER TABLE article_reports ADD COLUMN subject TEXT NOT NULL DEFAULT '';
ALTER TABLE article_reports ADD COLUMN category TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_article_reports_subject_status_created
  ON article_reports(subject, status, created_at DESC);

-- Cloudflare Access で認証されたメールアドレスごとに、閲覧・更新できる分野を設定する。
-- subject にはコンテンツの slug（例: mathematics）を入れる。* は全分野を示す。
CREATE TABLE IF NOT EXISTS report_admin_permissions (
  email TEXT NOT NULL COLLATE NOCASE,
  subject TEXT NOT NULL,
  PRIMARY KEY (email, subject)
);

-- 初期の全体管理者。ほかの担当者は運営ドキュメントの SQL で追加する。
INSERT OR IGNORE INTO report_admin_permissions (email, subject)
  VALUES ('ukyoukay0@gmail.com', '*');
