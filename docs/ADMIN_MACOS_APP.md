# Atlasez運営 macOSアプリ

## 方針

ブラウザのタブやChromeアプリモードを起動するランチャーではなく、独自ウィンドウ、サイドバー、アプリメニュー、キーボード操作を持つmacOSアプリとして提供する。業務画面・API・データは既存の `admin.atlasez.org` を利用し、サイト側の機能追加をそのままアプリでも使える構成にする。独立したオフライン製品やネイティブ画面への全面書き換えではない。

## 認証

- Google OAuthはアプリ内WebViewで実行せず、既定ブラウザで行う。アプリは先に127.0.0.1だけにbindした一時ポートのcallback listenerを起動する。
- WorkerはGoogleログイン後に2分で期限切れになる一回限りのPKCE認可コードを発行する。
- アプリはコードをWorkerへ交換し、短期セッションをKeychainへ保存する。WorkerのD1には既存と同じくセッショントークンのハッシュだけを保存する。
- アプリ内WebViewにはSecure/HttpOnly Cookieとしてセッションを渡す。通常のWeb/API権限チェックとログアウト処理は既存Workerを利用する。
- 新しいOAuthクライアントシークレットはアプリへ埋め込まない。

## ビルド

macOS上でUniversal（Apple Silicon / Intel）アプリとDMGを生成する。

```bash
npm run build:admin:dmg
```

出力先は `dist-macos/Atlasez-Admin.dmg`。配布時にGatekeeper警告をなくすには、Developer ID署名とApple公証が別途必要。

## 要件と制約

- macOS 13以降、Apple Silicon / Intelに対応。
- 画面、API、アップロード、ダウンロード、共同編集、権限は既存の運営サイトを利用する。インターネット接続が必要で、オフライン機能はない。
- 左サイドバーから運営ポータル、アクションセンター、記事・フィードバック、管理トップへ移動できる。サイドバーはドラッグで幅を調整でき、アイコンだけの幅にも折りたためる。幅と折りたたみ状態はこのMacに保存される。各ページ固有の機能はアプリ内WebViewでそのまま利用できる。
- Google OAuthの後、Workerはアプリが提示した `http://127.0.0.1:<ephemeral-port>/callback` に短命の認可コードを返す。アプリ独自URLスキームを使わず、PKCE verifierの一致を確認して一度だけ交換する。
- アプリのログアウトはWorker上のセッションを失効させ、KeychainとWebKit Cookieを消去する。

Worker変更の本番利用には、migration `0119_admin_native_app_auth.sql` の適用と、GitHub `main`からの正規Workers Buildsデプロイが必要。手動・ローカルから本番deployしない。
