# 応募メール通知の設定

応募を受け付けると、次の処理が行われます。応募が連続して届いた場合も、応募1件ごとに別の対応タスクとメール配信キューを作成します。

- 応募者へ受付確認メールを送る
- 運営内運営へ新着応募メールを送る
- 運営事務局プロジェクトに「応募対応」タスクを作る
- 管理画面の通知ベルに新着応募を表示する

応募データの保存、対応タスク、管理画面通知はメール設定がなくても動作します。メールはResendの配信キューに入り、送信失敗時は最大5回まで再試行します。配信は同時起動時の重複送信を防ぎながら、1回最大100件ずつ処理します。

同じ学校・職場などで同じネットワークから応募が集中する場合に備え、同一IPの制限は認証済み応募50件／10分、公開取込20件／10分に分けています。同じメールアドレスの応募が確認中の場合だけは、二重応募として受け付けません。

## 送信元アドレス

送信元には、Resendで認証した `atlasez.org` のアドレスを使います。例：

```text
Atlasez運営 <no-reply@atlasez.org>
```

Resendでドメインを追加し、表示されたSPF・DKIMなどのDNSレコードを `atlasez.org` に登録してから設定してください。Gmailの個人アドレスをそのまま送信元にするのではなく、運営ドメインの専用アドレスを推奨します。

## Cloudflareへの設定

管理WorkerにResendのAPIキーと送信元を登録します。APIキーは秘密情報なので、リポジトリや `wrangler.admin.jsonc` には書きません。

```bash
npx wrangler secret put RESEND_API_KEY --config wrangler.admin.jsonc
npx wrangler secret put EMAIL_FROM --config wrangler.admin.jsonc
```

通常は運営内運営のメールアドレスをD1の権限表から自動取得します。臨時に固定の追加宛先を指定する場合だけ、次を設定します。

```bash
npx wrangler secret put APPLICATION_OPERATIONS_EMAILS --config wrangler.admin.jsonc
```

複数の宛先はカンマ区切りで入力できます。送信元や宛先を変更した後は、管理Workerを再デプロイしてください。
