# デプロイ（DEPLOYMENT）

本番はCloudflare Workersで配信しています。Cloudflare Pagesや別アカウントのWorkerへはデプロイしません。

| 対象                   | Worker          | URL                                               | D1                |
| ---------------------- | --------------- | ------------------------------------------------- | ----------------- |
| 公開サイト・学習サイト | `atlasez01`     | `https://atlasez.org` / `https://www.atlasez.org` | `atlasez-reports` |
| 運営用サイト           | `atlasez-admin` | `https://admin.atlasez.org`                       | `atlasez-reports` |

## 正規の手順

1. `main`へマージする前にCIを通す
2. ローカルで `npm run verify:deploy-config` を実行する
3. 公開サイトは既存の公開サイト向け手順に従う。
4. 運営用サイトはPRのCI成功・レビュー後のmainをProduction branchに固定したCloudflare Workers Buildsだけで反映する。`.github/workflows/deploy-admin-from-github.yml`は検証専用で配信しない。`npm run deploy:admin`はWorkers Buildsが使えない緊急時のローカル例外手順（[`ADMIN_DEPLOYMENT_POLICY.md`](ADMIN_DEPLOYMENT_POLICY.md)）に限る。
5. Chromeで公開サイト、`/admin/portal/`、`/admin/member-calendar/`、`/admin/manage/?project=atlas`を確認する

本番Worker名・アカウント・ルート・D1は設定ファイルに固定し、`npm run verify:deploy-config`で確認します。ADMINのローカル緊急deployは、これに加えてmain由来の承認SHAとbuild-infoを検証します。

## ビルド設定

公開サイト本番ビルドでは次を固定します。

```bash
SITE_URL=https://atlasez.org
BASE_PATH=/
```

ADMINのproduction buildは次を固定します。

```bash
ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/
```

Workers Buildsは固定repository `Atlasez/Admin-Atlesez` / Production branch `main` / Worker `atlasez-admin`を使います。PRのCI成功・レビューに加えて、Build側でも全検証を成功条件にします。

```bash
# Workers Builds: Build command
npm ci && npm run verify:deploy-config && npm run check && npm run lint && npm test && npm run format:check && ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ CF_BRANCH=main npm run build && npm run verify:build-info && npx wrangler deploy --dry-run --config wrangler.admin.jsonc --keep-vars

# Workers Builds: Deploy command
npx wrangler deploy --config wrangler.admin.jsonc --keep-vars
```

Build checkout SHA・接続branch・build-infoを照合し、既存bindings・varsを維持します。任意のSHAを環境変数へ固定して成果物の身元を偽装しません。切替時は検証専用Workflowをmainへ先に反映し、旧Actions deployの待機・実行中runを別途停止・記録してからWorkers Buildsを接続します。二経路の同時有効化は禁止します。接続手順は[`ADMIN_WORKERS_BUILDS_RECONCILIATION.md`](ADMIN_WORKERS_BUILDS_RECONCILIATION.md)を参照してください。この文書変更だけではCloudflare接続や本番反映は完了しません。

WorkerのGitHub同期はCronを分離して8件ずつ処理し、0130のD1チェックポイントから再開します。

D1 migrationは通常Build/Deployに含めません。今回の0127・0128・0129・0130についてバックアップ・共有D1/旧Workerへの影響・復旧方法・隔離検証・適用記録を確定し、新Workerを配信する前に適用します。未適用なら接続・初回Buildを停止します。

配信後はWorkers Builds run・checkout SHA、固定Worker Version・100%配信、公開build-info、認証済みChromeを確認します。読み取り専用の`verify-admin-production.yml`はschedule/dispatchで最大15回、60秒間隔、job20分以内に照合し、未一致を失敗として報告します。監査JSONだけのmain advanceは公開SHAがmainの祖先で、差分が`docs/deployments/cloudflare-latest.json`だけと検証できる場合だけ許容します。

Workers Builds未接続・内部エラー・CI失敗・SHA不一致なら配信を止めてPR/Issueへ記録します。`npm run deploy:admin`はcleanなmain・remote main由来・明示承認SHA一致を検証し、緊急例外として対象SHAへの実行が別途明示承認された場合だけ使います。

`main`以外のプレビューは検索インデックスに入らないよう`noindex`になります。公開前に本番URLへ向けてビルドし直してください。

## デプロイ後の最低確認

```bash
curl -fsS https://atlasez.org/robots.txt
curl -fsS https://atlasez.org/sitemap-0.xml
```

さらにChromeのログイン済みセッションで、管理トップに権限管理・運営メンバー管理・ジャンル・役割管理・応募管理・閲覧統計が表示されることを確認します。

## ロールバック

コードの復旧はmain由来SHA・固定Worker Version・D1互換性・影響・復旧方法をレビューしてから実施します。SHA不一致や古い画面を理由に、対象未確認のrollback/promote/cache purge/Route変更を行いません。追加済みD1データを安易に削除しません。
