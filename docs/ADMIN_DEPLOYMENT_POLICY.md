# ADMIN本番デプロイ運用方針

この文書は、ADMINサイトで「GitHubにあるコード」と「Cloudflareが配信する成果物」が再び別物になることを防ぐための、Agent・開発者共通の運用契約である。

変更の具体的な進め方は[`ADMIN_CHANGE_WORKFLOW.md`](ADMIN_CHANGE_WORKFLOW.md)を読む。Agentはルートの`AGENTS.md`からこの2文書を必ず辿る。

## 1. 対象と正本

| 項目               | 固定値                                                     |
| ------------------ | ---------------------------------------------------------- |
| GitHub repository  | `Atlasez/Admin-Atlesez`                                    |
| Production branch  | `main`                                                     |
| Cloudflare account | `812021e62fa20465950b61be55dfe064`                         |
| Production Worker  | `atlasez-admin`                                            |
| Custom Domain      | `admin.atlasez.org`（zone `atlasez.org`）                  |
| D1                 | `atlasez-reports` / `d5112a62-7ed6-49c8-b6a2-18ee2dbab678` |
| Durable Object     | `atlasez-editorial-collaboration`                          |

GitHubの`main`を唯一の本番ソースとする。ADMIN本番の通常配信は、Production branchを`main`に固定したCloudflare Workers Buildsだけから固定Workerへ行う。Cloudflare Dashboardのコードエディター、Workers.dev URL、GitHub Pages、ローカルの`dist/`は本番の正本ではない。

## 2. 正規デプロイ経路

Cloudflare Workers Buildsでrepositoryを`Atlasez/Admin-Atlesez`、Production branchを`main`、root directoryをリポジトリルートに固定する。固定Worker・Account・Custom Domain・D1・DOを変更しない。他branchの自動配信・Preview配信は有効にしない。

1. GitHubのmain保護でPRのCI成功・レビューを必須にする。CI失敗や未レビューの変更をmainへマージしない。
2. `.github/workflows/deploy-admin-from-github.yml`は旧filenameを保った**検証専用**Workflowである。表示名は`Verify ADMIN build only`。成功したmain CIの成果物を検査し、dry-runと7日間のartifact保存だけを行う。deploy job、production Environment、Cloudflare書き込みtokenを追加しない。
3. Workers BuildsのBuild commandを次に固定する。全検証が成功した場合だけDeployへ進む。

   ```bash
   npm ci && npm run verify:deploy-config && npm run check && npm run lint && npm test && npm run format:check && ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ CF_BRANCH=main npm run build && npm run verify:build-info && npx wrangler deploy --dry-run --config wrangler.admin.jsonc --keep-vars
   ```

4. Workers BuildsのDeploy commandを次に固定する。

   ```bash
   npx wrangler deploy --config wrangler.admin.jsonc --keep-vars
   ```

   5分・毎時の保守処理からGitHub同期を分離し、編集室の公開状態同期（`*/2 * * * *`）と公開記事バックアップ（`1-59/2 * * * *`）を別Cronで実行する。各同期は8件ずつ進める。チェックポイント用migration `0130`を先に適用し、適用を確認できない場合は新Workerを配信しない。

5. Build checkoutのHEAD、Production branch、生成されたbuild-infoのcommit/ref/targetを照合する。`CF_BRANCH=main`だけを接続branch確認の代用にしない。任意のSHAを環境変数へ固定して成果物の身元を偽装しない。Cloudflare既存bindings・varsを維持し、接続前後の値をレビューする。
6. 通常Build/DeployではD1 migrationを実行しない。バックアップ・レビュー・適用・復旧方法を伴う別手順として、新Workerを配信する前に必要なmigrationの適用を記録する。今回の0127・0128・0129・0130が未適用なら初回Buildを開始しない。
7. Custom Domain `admin.atlasez.org`だけを本番確認先とし、`workers_dev`と`preview_urls`を無効にする。

切替手順は[`ADMIN_WORKERS_BUILDS_RECONCILIATION.md`](ADMIN_WORKERS_BUILDS_RECONCILIATION.md)を参照する。この方針・検証専用Workflowのレビュー済みmain反映を先に行い、旧Workflow定義で待機・実行中のActions deployを別途停止してrun ID・状態を記録する。Workflowのmergeだけでは既存runは取消されない。新しい定義にdeploy jobがないこと、旧runが残っていないこと、migration前提を確認してからWorkers Buildsを接続する。ActionsとWorkers Buildsの二経路を同時に有効にしない。

この文書やWorkflowの変更だけでは、Cloudflareの接続・設定保存・本番反映は完了しない。Workers Buildsが未接続・内部エラー・CI失敗・SHA不一致なら配信を止め、PR/Issueに理由を記録する。Actionsへの配信復帰を推測で行わない。

緊急ローカル例外はセクション5の対象SHA・理由・承認者・影響・復旧方法を記録し、レビュー済みmain commitに対する明示承認を得た場合だけ許可する。PRのCI成功や通常の本番反映依頼は、緊急ローカル例外の個別承認を意味しない。

## 3. ビルド成果物の身元確認

`npm run build` と `npm run build:ci` は `public/build-info.json` を生成する。ADMIN Workerはこのファイルを認証不要の照合用エンドポイントとして返すが、内容はrepository、commit、ref、target、build時刻だけで、秘密情報を含めない。

PR、Workers Builds run・checkout SHA、CloudflareのVersionを次のように突き合わせる。

```bash
npm run verify:deploy-config
ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ npm run build
npm run verify:build-info
npx wrangler deploy --dry-run --config wrangler.admin.jsonc
npx wrangler deployments list --config wrangler.admin.jsonc --name atlasez-admin
npx wrangler versions list --config wrangler.admin.jsonc --name atlasez-admin
curl -fsS https://admin.atlasez.org/build-info.json
```

`build-info.json.commit`、GitHub `main`のSHA、Cloudflare Versionの作成時刻が説明できない場合はデプロイを止める。例外は`docs/deployments/cloudflare-latest.json`だけを変更した監査PRで、公開SHAがmainの祖先で差分が監査JSONだけと検証できる場合は直前のコード配信SHAを許容する。Workers Buildsが監査PRも配信した場合はそのmain SHAとの一致を確認する。Chromeの画面が新しく見えるという理由だけでSHA一致と判断しない。

## 4. PRから本番までのチェックリスト

### PR前

- `git status`で既存変更を確認し、他人の変更を破棄しない。
- 変更がADMIN本番に影響することをPR本文に明記する。
- Worker名、Account ID、Custom Domain、D1、DOの差分を確認する。
- `npm run verify:deploy-config`、型検査、Lint、単体テスト、Format、ビルドを実行する。
- `dist/build-info.json`がPRのコミットSHAを指すことを確認する。

### マージ後

- `main`のCIが成功していることを確認する。
- 対象main SHAのWorkers Builds run・checkout SHA・全検証・ADMIN build・Deployの成功を確認する。
- 固定Worker名、Version ID、Deployment時刻、対象Versionの100%配信を記録する。
- `.github/workflows/verify-admin-production.yml`はschedule/dispatchで固定本番URLを読み取り、main SHAとの一致を検証する。Workers Builds遅延には最大15回・各60秒の待機、job全体20分の上限を設ける。待機中のActions runを理由に成功扱いしない。監査JSONだけのmain advanceは祖先関係と差分を検証した場合だけ許容する。
- 公開build-info照合と認証済みChrome確認が完了するまで、本番反映済みと報告しない。

Workers Builds未接続・内部エラー・CI失敗・SHA不一致なら本番反映を停止し、PR/Issueへ理由を記録する。緊急時だけセクション5の記録・ガード・明示承認を適用する。

### デプロイ後

- `https://admin.atlasez.org/build-info.json`を取得し、対象SHAと一致させる。
- 認証済みChromeで次を確認する。
  - `/admin/portal/`
  - `/admin/member-tasks/`
  - `/admin/member-calendar/`
  - `/admin/member-profile/`
  - `/admin/manage/?project=atlas`
  - `/admin/articles/`または変更対象画面
- 主要画面のHTML、`/_astro/`資産、認証APIのレスポンスに異常がないことを確認する。
- Version ID、SHA、確認時刻、確認者をPRまたはデプロイ記録に残す。

## 5. 手動デプロイが必要な緊急時

Workers Buildsが利用できず、本番対応を待てない緊急時だけ、レビュー済みmain commitを使う以下の手順を例外として許可する。対象SHA・理由・実施者と承認者・影響・復旧方法をIssueに記録し、デプロイ実行前に明示承認を得る。未レビューの成果物、Dashboard Editor、`wrangler versions upload`、feature branchの成果物は許可しない。

1. `main`の固定SHAから新しい作業ディレクトリを作る。
2. 未コミット変更を含めない。
3. `npm ci`、`npm run verify:deploy-config`、ビルド、`npm run verify:build-info`、`wrangler deploy --dry-run`を先に実行する。
4. `wrangler.admin.jsonc`だけを使い、`--keep-vars`を付ける。
5. 実施者、理由、SHA、Version ID、時刻、Chrome確認結果を記録する。
6. 終了後、Workers Buildsを復旧し、ローカル手動経路を常用しない。

ローカルの手動コマンドは、誤った作業ツリーからのDeployを防ぐため、cleanな`main` checkoutで実行する。ガードは`main`のremote-tracking upstreamが設定され、そのremote mainにHEADが含まれること、未追跡ファイルを含めworktreeがcleanであること、承認SHAがHEADと完全一致することを検証する。SHA省略、feature branch、detached HEAD、remote mainに含まれないcommit、未コミット変更の場合は停止する。SHAはコマンド内でその場のHEADから生成せず、レビュー・承認済みの値をリテラルで指定する。

```bash
DEPLOY_MAIN_SHA=REVIEWED_MAIN_SHA_40_HEX npm run deploy:admin
```

`REVIEWED_MAIN_SHA_40_HEX`を実際の40桁SHAに置き換え、この値がPRレビュー後に`main`へマージされたcommitであり、本番対象として明示承認されたことを別途確認してから実行する。Workers Buildsが復旧した後は、手動コマンドを使わず、レビュー・CI成功後のmainマージと固定Production branchのBuildを通常Deployトリガーとする。

Dashboard Editorで直接コードを修正して本番Versionを作ること、過去Versionを根拠なくpromote/rollbackすることは禁止する。

## 6. 不一致時の停止手順

次のどれかが発生した場合は、まず配信を止めて記録する。

- `build-info.json`のSHAが`main`と違い、差分が監査JSONだけではない
- Cloudflare VersionをWorkers Builds run・checkout SHAと照合できない
- 本番画面が直前のPRより古い
- `admin.atlasez.org`が別Worker、Workers.dev、別Accountへ向く
- CIが失敗している

その場合は、GitHub Issueに発生時刻・URL・Worker・Version ID・SHA・レスポンスヘッダー・Chrome確認結果を残し、推測で修正しない。rollbackやcache purgeが必要な場合は、対象Versionと影響をレビューで確定してから行う。

## 7. この方針の変更管理

この文書、`AGENTS.md`、`docs/DEPLOYMENT.md`、`docs/ADMIN_CHANGE_WORKFLOW.md`、`docs/ADMIN_KNOWLEDGE_BASE.md`、`.github/workflows/deploy-admin-from-github.yml`（検証専用）、`.github/workflows/verify-admin-production.yml`、`docs/ADMIN_WORKERS_BUILDS_RECONCILIATION.md`、関連テスト、`package.json`、`scripts/verify-deploy-context.mjs`、`wrangler.admin.jsonc`、`scripts/verify-deployment-config.mjs`、`scripts/write-build-info.mjs`、`scripts/verify-build-info.mjs`は運用の一組で管理する。いずれかだけを変更してはならない。
