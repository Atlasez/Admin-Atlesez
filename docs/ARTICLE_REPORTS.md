# 記事の問題報告フォーム

各記事の「この記事の問題を報告」は、Googleフォームを開かずにサイト内で送信できるフォームです。送信内容は Cloudflare Worker の `POST /api/article-reports` が受け取り、D1 の `article_reports` テーブルへ保存します。

## 運営用の確認画面

`/admin/reports/` で、届いた報告の一覧、対応状況（未確認・確認中・対応済み）、運営メモを管理できます。公開時は **Cloudflare Access** で次の2つを必ず同じ運営者だけに制限してください。

- `/admin/*`
- `/api/admin/*`

初期の許可メールアドレスは `ukyoukay0@gmail.com` です。記事を投稿する読者向けの `/api/article-reports` は保護対象に含めません。

## ローカルで確認する

初回だけ、別のターミナルでローカルD1にテーブルを作ります。

```bash
npm run db:reports:local
```

次に静的サイトをビルドし、Worker 経由で開きます。

```bash
npm run build
npm run dev:reports
```

`http://localhost:8787/atlas/ja/.../` の記事下部で送信を確認できます。ローカル保存済みの報告は次のコマンドで閲覧できます。

```bash
npx --yes wrangler d1 execute atlasez-reports-local --local --config wrangler.local.jsonc --command "SELECT article_title, report_type, details, created_at FROM article_reports ORDER BY created_at DESC"
```

## 送信データと対策

- 自動添付: 記事名、記事URL、記事ID、表示言語
- 利用者入力: 報告種別、内容、返信先（任意）
- 迷惑送信対策: 非表示のハニーポット、入力長の制限、送信前の最小滞在時間、同一記事・同一内容の7日間の重複拒否
- 連投対策: IPアドレスを保存しないSHA-256ハッシュにより、1時間あたり3件・24時間あたり8件までに制限

## 本番接続時にすること

本番公開前に、Cloudflare上でD1データベースを一つ作成し、`wrangler.local.jsonc` を元に本番用の `wrangler.jsonc` を作ります。その際は `database_id` を作成結果のUUIDに置き換え、`npx wrangler d1 migrations apply <database-name> --remote` で `migrations/0001_article_reports.sql` を適用します。

本番ではTurnstileも追加してbot対策を強化します。サイトキー・シークレットはリポジトリに書かず、Cloudflareの環境変数・シークレットで管理してください。
