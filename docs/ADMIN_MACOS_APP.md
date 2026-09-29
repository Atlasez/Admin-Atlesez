# Atlasez運営のmacOSアプリ

## 配布物の作成

Apple SiliconとIntel Macに対応するUniversalアプリとDMGを、macOS上で作成します。

```bash
npm run build:admin:dmg
```

既定の出力先は`dist-macos/Atlasez-Admin.dmg`です。別の出力先を指定する場合:

```bash
bash scripts/build-admin-dmg.sh /path/to/Atlasez-Admin.dmg
```

## 動作と互換性

- アプリは運営サイト本体を、既に起動している場合も含めてGoogle Chromeで開きます。Chromeに起動引数を渡す方式ではなくURLを直接開くため、Chromeが起動済みでも新しいタブへ移動します。
- 画面、API、ログイン、権限、リアルタイム共同編集、アップロード／ダウンロードなどを複製せず、通常のChrome版と同じサイト機能を使います。Chromeの既存プロファイルを共有するため、既存のGoogleログインとセッションを利用できます。
- Chromeがない場合は、macOSの既定ブラウザで開く選択肢を表示します。
- ネット接続が必須です。サイトのオフライン機能は追加しません。
- macOS 13以降に対応するApple Silicon／Intel Universalバイナリです。
- 現在の配布物はDeveloper ID署名・Apple公証なしです。外部配布時にGatekeeper警告をなくすには、Developer ID証明書による署名とApple公証が別途必要です。

## 変更・配布

アプリは`https://admin.atlasez.org/admin/atlas/?source=dmg`を開きます。サイトのURLや機能を変える場合は、`macos/AtlasezAdminLauncher.swift`を更新してDMGを再作成してください。Cloudflare Worker、D1、サイトのデプロイ設定には変更を加えません。
