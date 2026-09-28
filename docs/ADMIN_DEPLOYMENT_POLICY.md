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

GitHubの`main`とCloudflare Workers BuildsのProduction branchを唯一の本番ソースとする。Cloudflare Dashboardのコードエディター、Workers.dev URL、GitHub Pages、ローカルの`dist/`は本番の正本ではない。

## 2. 正規デプロイ経路

Cloudflare Dashboardで次を設定・維持する。

1. Git repositoryを `Atlasez/Admin-Atlesez` に接続する。
2. Production branchを `main` に固定する。
3. Build commandを次に固定する。

   ```bash
   npm ci && ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ npm run build
   ```

4. Deploy commandを次に固定する。

   ```bash
   npx wrangler deploy --config wrangler.admin.jsonc --keep-vars
   ```

5. Build cacheを無効にする。`dist/`を別ビルド間で再利用しない。
6. Custom Domainは `admin.atlasez.org` のProductionだけを本番入口にする。
7. Production Worker URLとPreview URLは本番確認先として使わない。設定ファイルでも`workers_dev`と`preview_urls`を無効にする。

通常の本番デプロイ経路はCloudflare Workers Buildsだけとし、GitHub Actionsに別の本番deploy経路を追加・併用しない。Workers Buildsの接続が未成立なら、本番デプロイは復旧するまで停止する。既存の手動GitHub Actions workflowは、この運用方針におけるデプロイ許可や承認の代替にはならず、実行しない。

なお、Cloudflare DashboardのGit repository接続が内部エラーで未成立の間は、自動経路は「復旧待ち」であり、本番自動デプロイ済みとはみなさない。接続復旧前に手動Uploadやfeature branchからのdeployで代替しない。

緊急時に例外経路を使う必要がある場合は、セクション5のローカル手動手順について対象SHA・理由・承認者・影響・復旧方法をIssueに記録し、レビュー済みmain commitに対する明示承認を得る。GitHub Actions workflowの存在や成功したCIは、この承認を意味しない。

## 3. ビルド成果物の身元確認

`npm run build` と `npm run build:ci` は `public/build-info.json` を生成する。ADMIN Workerはこのファイルを認証不要の照合用エンドポイントとして返すが、内容はrepository、commit、ref、target、build時刻だけで、秘密情報を含めない。

PRとCloudflareのVersionを次のように突き合わせる。

```bash
npm run verify:deploy-config
ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ npm run build
npm run verify:build-info
npx wrangler deploy --dry-run --config wrangler.admin.jsonc
npx wrangler deployments list --config wrangler.admin.jsonc --name atlasez-admin
npx wrangler versions list --config wrangler.admin.jsonc --name atlasez-admin
curl -fsS https://admin.atlasez.org/build-info.json
```

`build-info.json.commit`、GitHub `main`のSHA、Cloudflare Versionの作成時刻が説明できない場合はデプロイを止める。Chromeの画面が新しく見えるという理由だけでSHA一致と判断しない。

## 4. PRから本番までのチェックリスト

### PR前

- `git status`で既存変更を確認し、他人の変更を破棄しない。
- 変更がADMIN本番に影響することをPR本文に明記する。
- Worker名、Account ID、Custom Domain、D1、DOの差分を確認する。
- `npm run verify:deploy-config`、型検査、Lint、単体テスト、Format、ビルドを実行する。
- `dist/build-info.json`がPRのコミットSHAを指すことを確認する。

### マージ後

- `main`のCIが成功していることを確認する。
- Cloudflare Workers BuildsのProduction branchが`main`であることをDashboardで確認する。
- Build cacheが無効であることを確認する。
- Build/Deployログのcommit SHA、Worker名、Version ID、時刻を記録する。
- Versionが対象Workerへ100%配信されるまで本番完了とみなさない。

Workers Builds未接続時は本番反映を停止し、既存のGitHub Actions手動workflowを実行しない。緊急対応が必要な場合だけ、セクション5のローカル例外手順とIssue記録・明示承認を適用する。

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
6. 終了後、Workers Buildsを復旧し、手動経路を常用しない。

ローカルの手動コマンドは、誤った作業ツリーからのDeployを防ぐため、cleanな`main` checkoutで実行する。ガードは`main`のremote-tracking upstreamが設定され、そのremote mainにHEADが含まれること、未追跡ファイルを含めworktreeがcleanであること、承認SHAがHEADと完全一致することを検証する。SHA省略、feature branch、detached HEAD、remote mainに含まれないcommit、未コミット変更の場合は停止する。SHAはコマンド内でその場のHEADから生成せず、レビュー・承認済みの値をリテラルで指定する。

```bash
DEPLOY_MAIN_SHA=REVIEWED_MAIN_SHA_40_HEX npm run deploy:admin
```

`REVIEWED_MAIN_SHA_40_HEX`を実際の40桁SHAに置き換え、この値がPRレビュー後に`main`へマージされたcommitであり、本番対象として明示承認されたことを別途確認してから実行する。Cloudflare Workers Buildsが復旧した後は、手動コマンドを使わず、GitHub `main`のマージを唯一の通常Deployトリガーとする。

Dashboard Editorで直接コードを修正して本番Versionを作ること、過去Versionを根拠なくpromote/rollbackすることは禁止する。

## 6. 不一致時の停止手順

次のどれかが発生した場合は、まず配信を止めて記録する。

- `build-info.json`のSHAが`main`と違う
- Cloudflare VersionのSourceが不明、または手動Uploadになっている
- 本番画面が直前のPRより古い
- `admin.atlasez.org`が別Worker、Workers.dev、別Accountへ向く
- Build cacheが有効化されている
- CIが失敗している

その場合は、GitHub Issueに発生時刻・URL・Worker・Version ID・SHA・レスポンスヘッダー・Chrome確認結果を残し、推測で修正しない。rollbackやcache purgeが必要な場合は、対象Versionと影響をレビューで確定してから行う。

## 7. この方針の変更管理

この文書、`AGENTS.md`、`docs/DEPLOYMENT.md`、`docs/ADMIN_CHANGE_WORKFLOW.md`、`package.json`、`scripts/verify-deploy-context.mjs`、`wrangler.admin.jsonc`、`scripts/verify-deployment-config.mjs`、`scripts/write-build-info.mjs`、`scripts/verify-build-info.mjs`は運用の一組で管理する。いずれかだけを変更してはならない。
