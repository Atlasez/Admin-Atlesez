# 運営サイト完結型の記事公開

## 目的

記事の公開・公開取り消しを、運営者がGitHubを開かずに管理画面だけで完了させる。GitHubは確定版の保存とCI、Cloudflareは配信基盤として利用するが、通常運用の操作対象にはしない。

## 自動処理

管理画面で公開確定すると、管理Workerは公開RunをD1へ作成し、公開PRを作成する。GitHub Webhookの`check_run` / `check_suite` / `workflow_run` / `pull_request`を受信すると、対象PRだけを即時確認し、成功した場合だけ公開専用GitHub AppでMergeする。Cloudflareの自動ビルド後、`build-info.json`と記事URLを確認し、成功時にD1を公開済みに更新する。

一時的なCI・外部API失敗は最大2回まで再試行する。記事内容、スキーマ、競合、権限エラーは記事を勝手に変更せず、運営サイトへ日本語で表示する。Webhookが届かない場合に備え、1分Cronは同期・復旧用として残す。

## 初回の本番設定

1. GitHub Appを作成し、`Atlasez/Atlasez01`だけへインストールする。
2. AppにはMetadata read、Contents read/write、Pull requests read/write、Checks readを付与する。
3. `main`のルールセットで、公開専用Appを対象リポジトリだけのBypass actorに追加する。承認必須数は0に変更しない。
4. 管理Workerへ次のSecretを登録する。

   - `GITHUB_APP_ID`
   - `GITHUB_APP_INSTALLATION_ID`
   - `GITHUB_APP_PRIVATE_KEY`
   - `GITHUB_REVIEW_TOKEN`（推奨。PR作成者とは別の、レビューを承認できる書き込み権限アカウントのToken）

5. `PUBLIC_SITE_ORIGIN=https://atlasez.org`を設定する。
6. `GITHUB_WEBHOOK_SECRET`を管理WorkerのSecretへ登録し、`Atlasez/Atlasez01`のRepository webhookを次の設定で追加する。

   - Payload URL: `https://admin.atlasez.org/api/internal/github-publication-webhook`
   - Content type: `application/json`
   - Secret: `GITHUB_WEBHOOK_SECRET`と同じ値
   - Events: Check runs、Check suites、Workflow runs、Pull requests
   - Active: 有効

Webhookは署名を検証し、対象PR・ブランチ・Commitに紐づく公開Runだけを処理する。未署名または別リポジトリの通知は処理しない。

`GITHUB_PUBLISH_TOKEN`は移行期間の読み書き用フォールバックとして残すが、自動Mergeには利用しない。GitHub Appが未設定の場合、管理画面の公開連携は「自動公開未設定」と表示される。

`GITHUB_REVIEW_TOKEN`は公開用GitHub AppやPR作成者と同じアカウントにしない。専用Tokenが未設定でも、公開用Appが設定済みなら既存の人間用`GITHUB_PUBLISH_TOKEN`を移行用フォールバックとしてレビューに利用できる。管理画面はTokenの利用者・権限と自動承認の設定状態を表示し、CI成功後に別アカウントで対象Commitへの承認レビューを作成してから、公開用AppでMergeする。既存の同一Commitへの承認は再利用するため、Cron再実行でレビューを重複作成しない。

## 管理画面上の状態

`受付済み`、`自動検証中`、`公開処理中`、`学習サイト反映確認中`、`公開済み`、`自動再試行中`、`自動公開失敗`、`運営サイトで確認が必要`を表示する。

## 変更の安全性

- ブランチ保護を一時的に解除しない。
- WorkerからCloudflareへ直接デプロイしない。
- Run、CI結果、Merge SHA、配信確認時刻、失敗理由をD1に保存する。
- 同じ記事の自動実行Runは同時に1件だけにする。
- 自動MergeはCI成功、対象PR、対象ブランチを確認した後だけ実行する。
- 自動承認はCI成功、対象PRの作成者とのアカウント分離、対象Commit一致を確認した後だけ実行する。
- GitHub Tokenの値はレスポンスや監査ログへ出力しない。
