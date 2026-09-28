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
4. 運営用サイトはGitHub `main`をソースにしたCloudflare Workers Buildsを通常経路とする。`npm run deploy:admin`は通常手順ではなく、ADMIN緊急時のローカル例外手順（[`ADMIN_DEPLOYMENT_POLICY.md`](ADMIN_DEPLOYMENT_POLICY.md)）に限る。
5. Chromeで公開サイト、`/admin/portal/`、`/admin/member-calendar/`、`/admin/manage/?project=atlas`を確認する

本番Worker名・アカウント・ルート・D1は設定ファイルに固定し、`npm run verify:deploy-config`で確認します。ADMINのローカル緊急deployは、これに加えてmain由来の承認SHAとbuild-infoを検証します。

## ビルド設定

公開サイト本番ビルドでは次を固定します。

```bash
SITE_URL=https://atlasez.org
BASE_PATH=/
```

ADMINのCloudflare Workers Buildsは次を固定します。

```bash
ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/
```

`npm run deploy:admin`はこのADMIN設定を使い、デプロイ前にcleanな`main`・remote main由来・明示承認SHA一致・build-info SHA一致を検証します。ローカルからの実デプロイは緊急例外として別途明示承認された場合以外は行いません。

`main`以外のプレビューは検索インデックスに入らないよう`noindex`になります。公開前に本番URLへ向けてビルドし直してください。

## デプロイ後の最低確認

```bash
curl -fsS https://atlasez.org/robots.txt
curl -fsS https://atlasez.org/sitemap-0.xml
```

さらにChromeのログイン済みセッションで、管理トップに権限管理・運営メンバー管理・ジャンル・役割管理・応募管理・閲覧統計が表示されることを確認します。

## ロールバック

Workerの直前バージョンへ戻す場合は、Cloudflare WorkersのVersionsから対象Workerを選び、正しいWorker名を確認してロールバックします。別アカウントのWorkerへ切り替える操作は行いません。
