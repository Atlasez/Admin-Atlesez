# Atlasez運営 macOSアプリ

## 画面と役割

アプリは運営サイトを別ウィンドウで利用するためのmacOSシェルです。ホーム、記事、タスク、カレンダー、通知、権限などの画面と業務動作は、既存の `admin.atlasez.org` の画面・APIをそのまま使います。アプリ独自の簡易版画面を正本として二重実装しません。

- 起動時は運営サイトの `/admin/portal/` を開きます。
- ナビゲーションは運営サイト本来のヘッダーとタブをそのまま使います。アプリ独自のサイドバー、ページメニュー、二重のナビゲーションは表示しません。
- 業務データ、認証、権限、承認、監査、共同編集は既存サイトとWorkerが正本です。
- アプリはオンライン専用です。オフライン動作を装いません。

## ログインとセキュリティ

- Google OAuthは既定ブラウザで行い、127.0.0.1だけにbindする一時callback listenerとPKCEを使います。
- Workerが発行した短期セッションはmacOS Keychainに保存し、サイトにはSecure/HttpOnly Cookieとして渡します。
- 保存済みセッションが失効・無効化されていた場合はアプリ内に再ログイン画面を表示します。起動だけで既定ブラウザを開かず、「Googleでログイン」を押したときにのみ認証を開始します。
- OAuth client secretをアプリへ含めません。ログアウトはWorkerセッションを失効させ、KeychainとWebKit Cookieを消去します。

## 配布とアプリ内更新

運営ポータル最下部の「macOS版をダウンロード」から、GitHub Releasesの最新DMGを取得します。配布元はこのリポジトリのGitHub Releaseに固定します。

- `admin-vX.Y.Z` タグを `main` に付けると、macOSのRelease workflowがUniversal（Apple Silicon / Intel）DMGとアプリ更新用ZIPをビルドします。workflowはタグのcommitが `main` に含まれることを確認します。
- Sparkle 2.10の署名付きappcastを同じReleaseへ添付し、DMGと更新用ZIPはバージョン別URLから配布します。
- Sparkleは起動時に更新を確認し、更新がある場合は標準の確認ダイアログを表示します。アプリ独自のメニュー操作や無断インストールは追加しません。
- EdDSA署名検証と署名済みappcastを必須にします。秘密鍵はGitHub Actions Secret `SPARKLE_EDDSA_PRIVATE_KEY` に保管し、アプリには公開鍵のみを含めます。
- 既存の初期DMG（1.0.0）には更新機能がないため、初回だけポータルから最新DMGを入れ直す必要があります。更新機能付きの最初のRelease以降はアプリ内更新できます。

ローカルでは `npm run build:admin:dmg` でUniversal DMGを生成します。Release workflowはDMGに加えてSparkle用のアプリZIPと署名フィードも生成します。

## macOS配布上の制約

現在はDeveloper ID署名・Apple公証を設定していません。そのため初回インストール時にGatekeeperの警告が出ることがあります。SparkleのEdDSAは更新の改ざん検知に使いますが、Developer ID公証の代わりではありません。配布時の警告をなくすにはApple Developer ID証明書と公証資格情報の追加が必要です。
