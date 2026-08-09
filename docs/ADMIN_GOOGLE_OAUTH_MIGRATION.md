# 運営画面をGoogleログインへ移行する手順

現在の既定方式はCloudflare Accessです。`ADMIN_AUTH_MODE` を設定しない限り、既存のAccess認証ヘッダーだけを受け付けるため、今回の追加で運用中のログイン方式は変わりません。

## Cloudflare Accessを維持したまま試す

最初はWorkerの通常変数`ADMIN_AUTH_MODE`に`hybrid-preview`を設定してください。Cloudflare Accessは入口のまま残り、Accessを通過した運営者だけが管理画面内の「Googleログインを試す」を使えます。Googleでログイン後は、Googleから取得したメールアドレスで既存の担当分野権限を判定します。

この方式なら、Google OAuthのClient ID/Secret、リダイレクトURI、GoogleアカウントとD1権限の対応を確認してから、Accessを外す判断ができます。Googleログアウト後またはセッション期限切れ後は、従来のCloudflare Access認証に戻ります。

## 切替後の構成

Googleが本人確認を行い、管理Workerが確認済みメールアドレスを受け取ります。Workerは既存の`report_admin_permissions`表を参照して分野別権限を判定し、D1に保存した短期セッションでログイン状態を維持します。Cloudflare Accessは不要になりますが、Cloudflare Workers、D1、デプロイ、Discord通知はそのまま使います。

## 切替の準備

1. Google Cloud ConsoleでOAuth同意画面を公開し、OAuth 2.0の「ウェブアプリケーション」クライアントを作成する。
2. 承認済みリダイレクトURIに`https://atlasez-admin.ukyoukay0.workers.dev/auth/google/callback`を登録する。
3. Cloudflare Worker `atlasez-admin` のSecretへ、次を登録する。値はGitHubやチャットに貼らない。

   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`

4. 本番D1へ`migrations/0005_admin_google_oauth_sessions.sql`を適用する。
5. テスト用の運営者メールを`report_admin_permissions`へ追加し、`/auth/google/login`でGoogleアカウントを選択してログインできることを確認する。
6. Cloudflare Accessを維持して試す場合は、Workerの通常変数`ADMIN_AUTH_MODE`を`hybrid-preview`に設定してデプロイする。
7. 確認後にWorkerの通常変数`ADMIN_AUTH_MODE`を`google-oauth`に設定してデプロイする。
8. 最後にCloudflare Accessアプリケーションと許可メール一覧を無効化・削除する。

## ロールバック

Google側の問題が出た場合は、`ADMIN_AUTH_MODE`を削除するか`cloudflare-access`に戻すだけで、Cloudflare Access認証へ戻せます。D1の担当分野権限表は共通なので、権限の再登録は不要です。

## Google Workspaceグループについて

この初期実装は、Googleで確認された個別メールアドレスと`report_admin_permissions`を照合します。Google Workspaceグループで自動管理したい場合は、Google WorkspaceのDirectory APIと管理者承認を追加する次段階の拡張が必要です。これはログイン方式の切替とは独立して後から追加できます。
