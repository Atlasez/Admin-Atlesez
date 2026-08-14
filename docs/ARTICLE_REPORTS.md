# 記事の問題報告フォーム

各記事の「この記事の問題を報告」は、Googleフォームを開かずにサイト内で送信できるフォームです。送信内容は Cloudflare Worker の `POST /api/article-reports` が受け取り、D1 の `article_reports` テーブルへ保存します。

## Discord通知（任意）

`DISCORD_REPORT_WEBHOOK_URL` をCloudflare Worker `atlasez-web-1` のシークレットに設定すると、保存成功後にDiscordへ通知します。通知するのは記事名・分野・カテゴリ・報告種別だけで、報告本文と返信先はDiscordへ送りません。通知に失敗しても報告の保存は失敗しません。

Cloudflare Dashboardで Worker & Pages → `atlasez-web-1` → Settings → Variables and Secrets を開き、**Secret** として `DISCORD_REPORT_WEBHOOK_URL` を追加してください。値にはDiscordで新規発行したIncoming Webhook URLを入力します。Webhook URLは外部に共有した場合は無効化し、再発行してください。

### 分野別チャンネルへの通知

本番ではBotトークンを学習サイトへ置かず、`atlasez-admin` Workerの内部中継を利用します。学習サイトの各分野名をDiscordのカテゴリ（折りたたみ見出し）として作成し、その中に運営用チャンネルと `問題報告` チャンネルを配置します。分野とチャンネルの対応はD1に保存し、同じ準備処理を再実行しても二重作成しません。問題報告には記事名・分野・カテゴリ・報告種別だけを投稿し、本文・連絡先はDiscordへ送信しません。

初回のチャンネル準備には、Botが対象Guildに所属し、**チャンネルの管理（Manage Channels）**、**チャンネルを見る**、**メッセージを送信**の権限を持っている必要があります。準備APIは共有シークレットで保護され、通常の管理画面認証や読者向けAPIからは呼び出せません。権限不足の場合はDiscord APIの `Missing Permissions (50013)` を返します。権限を付与した後に同じ準備処理を再実行すれば、既存チャンネルを再利用して二重作成を避けます。

## 運営用の確認画面

`/admin/reports/` で、届いた報告の一覧、対応状況（未確認・確認中・対応済み）、運営メモを管理できます。読者向けWorkerとは別の `atlasez-admin` Workerで公開し、Worker全体を **Cloudflare Access** で運営者だけに制限します。

- `atlasez-admin.<account>.workers.dev/*`

初期の許可メールアドレスは `ukyoukay0@gmail.com` です。記事を投稿する読者向けの `/api/article-reports` は通常サイト側にだけ残し、保護対象に含めません。

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
