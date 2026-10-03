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

GitHubの`main`を唯一の本番ソースとする。ADMIN本番の通常配信はGitHub Actionsのdeploy workflowから固定Workerへ行う。Cloudflare Dashboardのコードエディター、Workers.dev URL、GitHub Pages、ローカルの`dist/`は本番の正本ではない。

## 2. 正規デプロイ経路

`.github/workflows/deploy-admin-from-github.yml`とGitHub側で次を維持する。

1. WorkflowはGitHub Actionsの`CI` workflowが`main`へのpushで成功した後にだけADMINをbuildしてdeployする。PRのCIや失敗したmain CIからは起動しない。
2. GitHub `production` Environmentは対象branchを`main`に制限し、required reviewerを設定し、admin bypassを無効にする。
3. Deploy用tokenは既存のGitHub Secret `CLOUDFLARE_DEPLOY_API_TOKEN`をWranglerのdeploy/status stepだけへ渡す。現在このSecretはrepository scopeで、Cloudflare token自体の権限一覧は確認できていない。このworkflowではproduction Environmentの承認後に限りSecretを使う。将来tokenをローテーションする際はproduction Environment専用Secretへ移し、固定Workerに必要な最小権限を確認する。読み取り専用監査tokenをdeployに流用せず、D1 migrationも実行しない。
4. ADMIN build commandを次に固定する。

   ```bash
   npm ci && ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ npm run build
   ```

5. Deploy commandを次に固定する。

   ```bash
   npx wrangler deploy --config wrangler.admin.jsonc --keep-vars
   ```

6. Verify jobでbuild-info SHA、dry-run、型検査、Lint、単体テスト、Formatを検証してから、`dist/`を7日間artifactとしてdeploy jobへ渡す。deploy jobは配信直前に`main`が対象SHAから進んでいないことを再確認する。
7. 通常deployではD1 migrationを実行しない。migrationはバックアップ・レビュー・影響・復旧方法を伴う別の手順で実施する。
8. Custom Domainは `admin.atlasez.org` のProductionだけを本番入口にする。Production Worker URLとPreview URLは本番確認先として使わず、設定でも`workers_dev`と`preview_urls`を無効にする。

通常の本番デプロイ経路はGitHub Actions deploy workflowだけとする。Cloudflare Workers Buildsを接続・併用しない。GitHub Actionsが利用できない場合はセクション5の緊急例外だけを使い、Dashboard Editorや別のWorkflowを新しい経路として追加しない。

Cloudflare Workers Builds接続が内部エラーでも、GitHub Actions deploy workflowが成功し、Environment承認・Worker Version・build-infoを照合できればADMINの本番反映として扱う。

Workers Buildsへ戻す場合は、先にPRでこの方針・GitHub workflow・監査手順を一組で変更し、GitHub Actions経路を無効化してからCloudflare接続を設定する。2つの経路を同時に有効にしない。

緊急時にローカル例外を使う必要がある場合は、セクション5の手順について対象SHA・理由・承認者・影響・復旧方法をIssueに記録し、レビュー済みmain commitに対する明示承認を得る。CI成功やGitHub Actionsの環境承認は、ローカル例外経路の承認を意味しない。

## 3. ビルド成果物の身元確認

`npm run build` と `npm run build:ci` は `public/build-info.json` を生成する。ADMIN Workerはこのファイルを認証不要の照合用エンドポイントとして返すが、内容はrepository、commit、ref、target、build時刻だけで、秘密情報を含めない。

PR、GitHub Actions run、CloudflareのVersionを次のように突き合わせる。

```bash
npm run verify:deploy-config
ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ npm run build
npm run verify:build-info
npx wrangler deploy --dry-run --config wrangler.admin.jsonc
npx wrangler deployments list --config wrangler.admin.jsonc --name atlasez-admin
npx wrangler versions list --config wrangler.admin.jsonc --name atlasez-admin
curl -fsS https://admin.atlasez.org/build-info.json
```

`build-info.json.commit`、GitHub `main`のSHA、Cloudflare Versionの作成時刻が説明できない場合はデプロイを止める。例外は`docs/deployments/cloudflare-latest.json`だけを変更した監査PRで、この場合だけ直前のコードdeploy SHAを維持し、次のコード・コンテンツ・設定変更を含むmain pushで最新SHAへ進める。Chromeの画面が新しく見えるという理由だけでSHA一致と判断しない。

## 4. PRから本番までのチェックリスト

### PR前

- `git status`で既存変更を確認し、他人の変更を破棄しない。
- 変更がADMIN本番に影響することをPR本文に明記する。
- Worker名、Account ID、Custom Domain、D1、DOの差分を確認する。
- `npm run verify:deploy-config`、型検査、Lint、単体テスト、Format、ビルドを実行する。
- `dist/build-info.json`がPRのコミットSHAを指すことを確認する。

### マージ後

- `main`のCIが成功していることを確認する。
- `.github/workflows/deploy-admin-from-github.yml`が対象`main` SHAでCI・ADMIN build・dry-runを成功させる。
- GitHub `production` Environmentの承認履歴を確認する。
- GitHub Deploy runのcommit SHA、Worker名、Version ID、時刻を記録する。
- Versionが対象Workerへ100%配信されるまで本番完了とみなさない。
- `.github/workflows/verify-admin-production.yml`がdeploy完了後に公開`build-info.json`と対象`main` SHAの一致を確認するまで、本番完了とみなさない。監査JSONだけのmain advanceはworkflowがcommit差分を検証して例外扱いする。

GitHub Actions deploy workflowが未接続・CI失敗・Environment拒否・SHA不一致なら本番反映を停止し、Issueへ理由を記録する。緊急対応が必要な場合だけ、セクション5のローカル例外手順とIssue記録・明示承認を適用する。

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

GitHub Actions deploy workflowが利用できず、本番対応を待てない緊急時だけ、レビュー済みmain commitを使う以下の手順を例外として許可する。対象SHA・理由・実施者と承認者・影響・復旧方法をIssueに記録し、デプロイ実行前に明示承認を得る。未レビューの成果物、Dashboard Editor、`wrangler versions upload`、feature branchの成果物は許可しない。

1. `main`の固定SHAから新しい作業ディレクトリを作る。
2. 未コミット変更を含めない。
3. `npm ci`、`npm run verify:deploy-config`、ビルド、`npm run verify:build-info`、`wrangler deploy --dry-run`を先に実行する。
4. `wrangler.admin.jsonc`だけを使い、`--keep-vars`を付ける。
5. 実施者、理由、SHA、Version ID、時刻、Chrome確認結果を記録する。
6. 終了後、GitHub Actions deploy workflowを復旧し、ローカル手動経路を常用しない。

ローカルの手動コマンドは、誤った作業ツリーからのDeployを防ぐため、cleanな`main` checkoutで実行する。ガードは`main`のremote-tracking upstreamが設定され、そのremote mainにHEADが含まれること、未追跡ファイルを含めworktreeがcleanであること、承認SHAがHEADと完全一致することを検証する。SHA省略、feature branch、detached HEAD、remote mainに含まれないcommit、未コミット変更の場合は停止する。SHAはコマンド内でその場のHEADから生成せず、レビュー・承認済みの値をリテラルで指定する。

```bash
DEPLOY_MAIN_SHA=REVIEWED_MAIN_SHA_40_HEX npm run deploy:admin
```

`REVIEWED_MAIN_SHA_40_HEX`を実際の40桁SHAに置き換え、この値がPRレビュー後に`main`へマージされたcommitであり、本番対象として明示承認されたことを別途確認してから実行する。GitHub Actionsが復旧した後は、手動コマンドを使わず、レビュー済み`main`のCI成功とproduction Environment承認を通常Deployトリガーとする。

Dashboard Editorで直接コードを修正して本番Versionを作ること、過去Versionを根拠なくpromote/rollbackすることは禁止する。

## 6. 不一致時の停止手順

次のどれかが発生した場合は、まず配信を止めて記録する。

- `build-info.json`のSHAが`main`と違い、差分が監査JSONだけではない
- Cloudflare VersionをGitHub Actions runと照合できない
- 本番画面が直前のPRより古い
- `admin.atlasez.org`が別Worker、Workers.dev、別Accountへ向く
- CIが失敗している

その場合は、GitHub Issueに発生時刻・URL・Worker・Version ID・SHA・レスポンスヘッダー・Chrome確認結果を残し、推測で修正しない。rollbackやcache purgeが必要な場合は、対象Versionと影響をレビューで確定してから行う。

## 7. この方針の変更管理

この文書、`AGENTS.md`、`docs/DEPLOYMENT.md`、`docs/ADMIN_CHANGE_WORKFLOW.md`、`docs/ADMIN_KNOWLEDGE_BASE.md`、`.github/workflows/deploy-admin-from-github.yml`、関連テスト、`package.json`、`scripts/verify-deploy-context.mjs`、`wrangler.admin.jsonc`、`scripts/verify-deployment-config.mjs`、`scripts/write-build-info.mjs`、`scripts/verify-build-info.mjs`は運用の一組で管理する。いずれかだけを変更してはならない。
