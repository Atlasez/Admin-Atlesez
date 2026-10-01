# 記事の問題報告フォーム

各記事の「この記事の問題を報告」は、Googleフォームを開かずにサイト内で送信できるフォームです。送信内容は Cloudflare Worker の `POST /api/article-reports` が受け取り、D1 の `article_reports` テーブルへ保存します。

## Discord通知（任意）

`DISCORD_REPORT_WEBHOOK_URL` をCloudflare Worker `atlasez01` のシークレットに設定すると、保存成功後にDiscordへ通知します。通知するのは記事名・分野・カテゴリ・報告種別だけで、報告本文と返信先はDiscordへ送りません。通知に失敗しても報告の保存は失敗しません。

Cloudflare Dashboardで Workers & Pages → `atlasez01` → Settings → Variables and Secrets を開き、**Secret** として `DISCORD_REPORT_WEBHOOK_URL` を追加してください。値にはDiscordで新規発行したIncoming Webhook URLを入力します。Webhook URLは外部に共有した場合は無効化し、再発行してください。

## 運営用の確認画面

`https://admin.atlasez.org/admin/reports/` で、届いた報告の一覧、対応状況（未確認・確認中・対応済み）、運営メモを管理できます。読者向けWorkerとは別の `atlasez-admin` Workerから配信し、Google OAuthで認証します。D1の担当分野・管理権限に基づいて閲覧・対応を制限します。Workers.devや別Workerを本番確認先として使いません。

初期の許可設定はD1の `report_admin_permissions`（`subject='*'`）で管理します。記事を投稿する読者向けの `/api/article-reports` は通常サイト側にだけ残し、保護対象に含めません。

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

本番の公開Workerは `atlasez01`、ADMIN Workerは `atlasez-admin`、Accountは `812021e62fa20465950b61be55dfe064` に固定しています。D1は既存の `atlasez-reports`（`d5112a62-7ed6-49c8-b6a2-18ee2dbab678`）を利用します。別のD1や推測したAccountを作成して接続しないでください。

設定やmigrationの変更はPRで対象・影響・復旧方法をレビューし、[ADMINデプロイ運用方針](ADMIN_DEPLOYMENT_POLICY.md)と[変更手順](ADMIN_CHANGE_WORKFLOW.md)に従います。ADMINの通常の本番反映はGitHub mainをソースとするWorkers Buildsだけです。

本番ではTurnstileも追加してbot対策を強化します。サイトキー・シークレットはリポジトリに書かず、Cloudflareの環境変数・シークレットで管理してください。
