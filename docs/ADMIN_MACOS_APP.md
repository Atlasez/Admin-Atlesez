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
- Sparkleは起動時に更新を確認し、更新がある場合は標準の確認ダイアログを表示します。「Atlasez運営」メニューの「アップデートを確認…」から手動確認もできます。インストールは標準の確認画面から行います。
- EdDSA署名検証と署名済みappcastを必須にします。秘密鍵はGitHub Actions Secret `SPARKLE_EDDSA_PRIVATE_KEY` に保管し、アプリには公開鍵のみを含めます。
- 既存の初期DMG（1.0.0）には更新機能がないため、初回だけポータルから最新DMGを入れ直す必要があります。更新機能付きの最初のRelease以降はアプリ内更新できます。

ローカルでは `npm run build:admin:dmg` でUniversal DMGを生成します。Release workflowはDMGに加えてSparkle用のアプリZIPと署名フィードも生成します。

## macOS配布上の制約

現在はDeveloper ID署名・Apple公証を設定していません。そのため初回インストール時にGatekeeperの警告が出ることがあります。SparkleのEdDSAは更新の改ざん検知に使いますが、Developer ID公証の代わりではありません。配布時の警告をなくすにはApple Developer ID証明書と公証資格情報の追加が必要です。

## 起動・通信・ウィンドウの復旧

1.0.4以降は、起動時にWebKitの有効なCookieを先に確認します。Keychainの読み書きは画面描画のスレッドから外し、古いアプリのKeychain項目へのアクセス許可待ちで画面を停止させません。復元が5秒で終わらなければ再ログインできる画面を表示します。アプリの署名が更新で変わって古い項目を読めない場合も、アクセス制御は緩めず、新しい認証で取得したセッションを別のKeychain項目へ保存します。

ログイン待機を180秒、認証結果の交換を30秒、Keychainへの保存を15秒で打ち切り、アプリ内から再試行できます。キャンセルした認証の遅い結果は破棄します。callbackの重複パラメータ・空の認証コード・state不一致を拒否し、正しいcallbackの待機は続けます。

通信失敗、45秒を超える読み込み、サーバーの5xx、WebKit表示プロセスの終了では、現在のページの再試行画面を表示します。通信再接続・スリープ復帰後は失敗中のページだけを再読み込みし、編集中の正常なページを勝手に更新しません。「表示」メニューの再読み込み（⌘R）も使えます。

画像などの添付にはmacOSのファイル選択、CSV/PDFなどのダウンロードには保存先選択を使います。ダウンロード完了後にファイルを保存先へ移し、途中で失敗したダウンロードで既存のファイルを上書きしません。

メイン画面は一つに固定し、閉じた後もアプリを開き直すと再表示します。ウィンドウの位置・サイズを保存し、画面を移しただけで拡大・中央配置し直しません。画面の取り外しで表示範囲から外れた場合は、利用可能な画面内へ戻します。編集用の別ウィンドウは閉じた時点で解放します。

## macOSでの検証

```bash
ATLASEZ_APP_OUTPUT=dist-macos/test/Atlasez運営.app npm run build:admin:dmg -- dist-macos/test/Atlasez-Admin.dmg
bash scripts/test-admin-macos.sh
```

macOS CIとRelease workflowでUniversalビルド・署名構造・ネイティブ回帰テストを実行します。テストは専用Keychainサービスと永続化しないWebKit Cookieを使い、本番アカウントや保存済みのログイン情報を変更しません。実ソケットで不正・分割callback、認証の時間切れ・キャンセル、認証交換中のキャンセルと再試行を検証します。WebKitモデルの通信失敗・表示停止・セッション失効、画面の取り外し、ダウンロードの完了・上書き・失敗も対象です。

Release公開前には `scripts/verify-admin-update.swift` で、生成したフィードとZIPをアプリに含めた公開鍵で検証します。フィード／ZIPの改ざん、途中で切れたZIP、別の署名鍵を拒否できることと、フィード／バンドルのバージョン一致を確認します。

ファイル選択と保存ダイアログの実機検証は、本番へアップロードしない専用fixtureで行えます。

```bash
bash scripts/test-admin-macos.sh dist-macos/test/Atlasez運営.app --fixture
# dist-macos/tests/Atlasez Native Regression Fixture.app を開く
```

配布後は旧版からSparkle更新を実行し、ログイン保持、再起動、閉じたウィンドウの再表示、主要画面と編集用別ウィンドウを実機確認します。共同編集の実通信とスリープ後の通信復旧は本番側の状態に依存するため、fixtureやモデルのテスト結果とは分けて記録します。
