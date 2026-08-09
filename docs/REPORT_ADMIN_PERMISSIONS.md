# 記事報告の担当分野管理

記事の問題報告は、記事ページが持つ `subject`（例: `mathematics`）と `category`（例: `group-theory`）を保存します。運営画面では Cloudflare Access が認証したメールアドレスと、D1 の `report_admin_permissions` を照合して、担当分野の報告だけを表示・更新できます。

## 設定の流れ

1. Cloudflare Zero Trust の Access アプリケーションで、運営者のメールアドレスを `admin/reports` にアクセスできるポリシーへ追加します。
2. Cloudflare Dashboard の D1 コンソールで、`0004_article_report_subject_permissions.sql` を一度実行します。
3. 同じ D1 コンソールで担当分野を登録します。`subject` は記事データの slug を使います。

```sql
-- 数学担当を追加する例
INSERT OR IGNORE INTO report_admin_permissions (email, subject)
VALUES ('math-editor@example.com', 'mathematics');

-- 物理と天文を兼任する例
INSERT OR IGNORE INTO report_admin_permissions (email, subject)
VALUES
  ('science-editor@example.com', 'physics'),
  ('science-editor@example.com', 'astronomy');

-- 全分野を閲覧・更新できる管理者を追加する例
INSERT OR IGNORE INTO report_admin_permissions (email, subject)
VALUES ('chief-editor@example.com', '*');
```

担当から外す場合は次を実行します。

```sql
DELETE FROM report_admin_permissions
WHERE email = 'math-editor@example.com' AND subject = 'mathematics';
```

現在の設定は次で確認できます。

```sql
SELECT email, subject
FROM report_admin_permissions
ORDER BY email, subject;
```

`ukyoukay0@gmail.com` は初期状態で `*`（全分野）の管理者として登録されます。過去に受信済みで分野が空欄の報告は、全分野管理者だけが確認できます。

## 仕組みと注意点

- Cloudflare Access が「誰が管理画面へ入れるか」を決め、Worker が「入れた人のうち、どの分野の報告を読んで更新できるか」を決めます。両方の設定が必要です。
- Worker は Cloudflare Access の `Cf-Access-Authenticated-User-Email` ヘッダーのみを権限判定に使います。ブラウザーから任意のメールアドレスを送って権限を偽装することはできません。
- 分野の追加・名称変更時は、記事データの `subject` slug と同じ値を権限テーブルにも追加してください。
