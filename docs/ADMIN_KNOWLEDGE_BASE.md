# Atlasez ADMIN 運用ナレッジベース

この文書は、Atlasezの管理担当者が交代しても、サイトを安全に運用・復旧できるようにするための正本です。
実装の細部は各専門ドキュメントを参照し、ここでは「どこを見ればよいか」「何をしてはいけないか」「障害時にどう戻すか」をまとめます。

## 1. 正本と本番構成

### GitHub

アプリケーションの正しいリポジトリは次の1つです。

- [Atlasez/Admin-Atlesez](https://github.com/Atlasez/Admin-Atlesez)

`Atlasez/atlasez`など、名前が似ている別リポジトリは本番アプリの正本ではありません。
記事・画面・Worker設定を変更するときは、必ずこのリポジトリの`main`から作業ブランチを作成します。

### Cloudflare

本番はPagesではなくCloudflare Workersです。

| 用途                   | Worker          | URL                                               | D1                |
| ---------------------- | --------------- | ------------------------------------------------- | ----------------- |
| 公式サイト・学習サイト | `atlasez01`     | `https://atlasez.org` / `https://www.atlasez.org` | `atlasez-reports` |
| 運営用サイト           | `atlasez-admin` | `https://admin.atlasez.org`                       | `atlasez-reports` |

両WorkerのCloudflareアカウント、D1、ルートは`wrangler.jsonc`と`wrangler.admin.jsonc`に固定しています。
認証トークン、OAuth Client Secret、Resend APIキーなどの秘密情報はGitHubやこの文書へ保存しません。

### データの責任範囲

- GitHub: ソースコード、記事、画面、設定、マイグレーション
- D1 `atlasez-reports`: 閲覧統計、問題報告、応募、コメント・編集関連の運用データ
- Cloudflare Worker: 認証、API、メールキュー、タスク、動的な管理画面
- Google Search Console: 検索インデックス・検索流入の外部レポート
- Resend: 応募受付・運営通知・受け入れ通知のメール配送

## 2. 通常のデプロイ

作業前に、別の一時コピーや古いcloneではなく、このリポジトリの最新`main`から作業します。

```bash
git fetch admin main
git switch main
git pull --ff-only
git switch -c codex/<変更内容>
npm ci
npm run verify:deploy-config
npm run check
npm run format:check
npm test
```

デプロイは次のコマンドだけを使います。

```bash
# 公開サイト・学習サイト
npm run deploy:public

# 運営用サイト
npm run deploy:admin
```

これらは実行前に、Worker名・Cloudflareアカウント・ドメインルート・D1が正しいか検査します。
検査に失敗した場合は、設定を手で書き換えて続行せず、正しい設定ファイルを確認してください。
CIにも同じ検査が入っています。

## 3. デプロイ後のChrome確認

ログイン済みChromeで、最低限次を確認します。

1. `https://atlasez.org/` と`https://atlasez.org/atlas/ja/`が表示される
2. `https://admin.atlasez.org/admin/portal/`にログインできる
3. メンバー用サイトに「タスク管理」「カレンダー」「マイページ」「管理」がある
4. `https://admin.atlasez.org/admin/member-calendar/`でカレンダーが表示される
5. `https://admin.atlasez.org/admin/manage/?project=atlas`で次が表示される
   - 運営者・担当管理
   - 運営内自己紹介の承認
   - 問題報告
   - 閲覧統計
   - 応募管理
6. 編集画面を開き、記事一覧・本文・プレビュー・コメントが読み込まれる

公開サイトの機械的な確認:

```bash
curl -fsS https://atlasez.org/robots.txt
curl -fsS https://atlasez.org/sitemap-0.xml
```

## 4. 現在の管理画面の構成

### メンバー用サイト

- `/admin/portal/`: メンバー向けトップ。参加中プロジェクト、カレンダー、タスクを表示
- `/admin/member-calendar/`: 全プロジェクト横断のカレンダー
- `/admin/member-tasks/`: 全プロジェクト横断のタスク
- `/admin/member-profile/`: 基本情報とプロフィール
- `/admin/manage/?project=atlas`: 対象プロジェクトの管理トップへ直行

「管理」はプルダウンで開く方式ではなく、管理トップへ直接移動する設計です。
プロジェクト固有の管理機能は、対象プロジェクトの管理トップに置きます。

### 学習サイト運営管理

- `/admin/articles/`: 編集・フィードバックの記事一覧
- `/admin/editor/?document=<ID>`: 記事編集スペース
- `/admin/applications/?project=atlas`: 運営参加応募の確認
- `/admin/permissions/?project=atlas`: 運営者・担当管理
- `/admin/reports/?project=atlas`: 問題報告
- `/admin/analytics/?project=atlas`: 閲覧統計
- `/admin/calendar/?project=atlas`: 学習サイト運営のカレンダー
- `/admin/operations/?project=atlas`: 学習サイト運営のタスク・進捗

問題報告と閲覧統計、進捗報告とTodoは別ページです。管理トップのカードから開きます。

## 5. 記事編集の運用知識

- 本文、プレビュー、執筆メモ、コメントは編集スペース内の枠として扱う
- プレビューは独立スクロール領域で、下端まで表示できることを確認する
- ロックした本文範囲は薄い赤でマーキングされる
- コメントの返信は横方向に伸ばさず、縦方向に並べる
- 選択範囲は初回自動登録、2回目以降は同じ1つ目の範囲を自動更新する
- コメントはタグ・確認状態・検索語で絞り込める
- コメントの状態は「確認済み」「未反映」「反映済み」。投稿者と対応者の双方が反映済みにすると解決済みになる
- フィードバック依頼は常時表示し、複数人を指定できる。キャンセル時に依頼先を必須にしない
- 枠の移動・別窓化では、元の段の空き枠を詰め、段の分割状態を自動的に再計算する
- 戻る操作の遷移先は学習サイトトップではなく編集・フィードバック一覧
- 保存前の非表示フォーム項目をブラウザの必須入力検証対象にしない

### Markdown・数式・マクロ

- インライン数式: `$...$`
- 表示数式: `$$...$$`
- 命題・定義などの枠: `/help`で現在使える記法を確認
- LaTeXマクロは組み込みプリセット、自作プリセット、複数プリセットをまとめたグループを使用できる
- 自作マクロ・参考文献・TikZの詳細は[EDITORIAL_MEDIA_AND_LATEX.md](EDITORIAL_MEDIA_AND_LATEX.md)と[TIKZ_RENDERER.md](TIKZ_RENDERER.md)を参照

## 6. 応募・メール運用

応募フローは基本情報とプロジェクト固有情報を分離します。基本情報入力済みの人は、応募先プロジェクトのフォームへ進めます。
複数プロジェクトへの応募を妨げないよう、応募フォームへの導線は応募済みの人にも表示します。

応募1件ごとに、応募データ・対応タスク・通知を独立して作成します。応募が連続しても1件に上書きしません。
メール設定と送信元ドメインの設定は[APPLICATION_EMAILS.md](APPLICATION_EMAILS.md)を参照してください。

秘密情報の登録例:

```bash
npx wrangler secret put RESEND_API_KEY --config wrangler.admin.jsonc
```

値をチャット、Issue、Markdown、`wrangler*.jsonc`へ貼り付けないでください。

## 7. 障害対応

### 管理トップからカレンダーや応募管理が消えた

1. `git log`とデプロイ元ブランチを確認する
2. `npm run verify:deploy-config`を実行する
3. `wrangler.admin.jsonc`を使って`atlasez-admin`へ現行`main`をデプロイする
4. Chromeで`/admin/portal/`と`/admin/manage/?project=atlas`を確認する
5. 古い一時cloneや、別アカウントのWorkerへ再デプロイしない

### 記事が開けない

1. 管理Workerの認証状態を確認する
2. ブラウザのConsoleで最初のAPIエラーを確認する。後続の表示エラーだけを原因と判断しない
3. `/admin/articles/`から記事IDを再確認する
4. D1マイグレーションの適用漏れを確認する
5. 記事本文を変更する前に、Workerのバージョンと直近のデプロイ差分を比較する

### 保存時に「必須項目を確認」と表示される

非表示のカスタムプリセット・参考文献入力欄が`required`のままになっていないか確認します。
フォームを開いていない入力欄はブラウザ標準の必須検証対象から外し、保存処理側で実際に入力された項目だけを検証します。

### 閲覧統計が空、または古い

管理Workerの`PUBLIC_ANALYTICS_ORIGIN`が`https://atlasez.org`になっていることを確認します。
Google Search Consoleの数値はクロール・API更新の遅延があるため、管理画面の保存済みスナップショットとリアルタイムの閲覧統計を分けて扱います。

### 検索インデックスの警告

サイトマップには`noindex`ページを含めないようにしています。Search Consoleの件数は再クロールまで古い状態を表示することがあります。
`robots.txt`、`sitemap-0.xml`、canonical、`noindex`の実配信を先に確認し、その後Search Consoleで検証を開始します。

## 8. 2026-08-27のデプロイ事故記録

### 発生したこと

調査中に取得した古い作業コピーを本番管理Workerへデプロイしたため、最新のカレンダー、管理メニュー、応募管理などが一時的に表示されなくなりました。
また、公開サイトの実ルートを持たない別CloudflareアカウントのWorkerへ公開版をデプロイしたため、統計・SEO確認先も一致していませんでした。

### 復旧

- 管理サイトを正しいアカウントの`atlasez-admin`へ再デプロイ
- 公開サイトを正しいルートの`atlasez01`へ再デプロイ
- Chromeでポータル、カレンダー、管理トップ、応募管理、閲覧統計を確認
- 正しいGitHubリポジトリへ現行コードを同期

### 再発防止

- `verify-deployment-config.mjs`を追加
- CIで本番ターゲット検証を必須化
- `npm run deploy:public` / `npm run deploy:admin`を正規コマンド化
- Pages前提の古い説明を削除し、Workers構成へ統一
- PR #29で現行版を同期し、PR #30でデプロイガードをmainへマージ

この事故の教訓は、画面が存在するかだけでなく「どのWorker・どのアカウント・どのルートへデプロイしたか」を毎回確認することです。

## 9. 変更を加える前のチェックリスト

- [ ] 正しいリポジトリ `Atlasez/Admin-Atlesez` を開いている
- [ ] `main`の最新を取り込んでいる
- [ ] 変更対象がコードかD1かCloudflare設定かを分けている
- [ ] 個人情報・APIキー・OAuth秘密値をコミットしていない
- [ ] `npm run verify:deploy-config` が成功した
- [ ] `npm run check`、`npm run format:check`、`npm test`が成功した
- [ ] Chromeで対象画面を確認した
- [ ] デプロイ後に本番WorkerとURLが正しいことを確認した
