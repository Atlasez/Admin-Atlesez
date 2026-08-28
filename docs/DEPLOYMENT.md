# デプロイ（DEPLOYMENT）

ADMIN本番の詳細な運用契約は [ADMIN_DEPLOYMENT_POLICY.md](ADMIN_DEPLOYMENT_POLICY.md) を正本とする。Agentは作業前にこの文書と`AGENTS.md`を読む。

本番はCloudflare Workersで配信しています。Cloudflare Pagesや別アカウントのWorkerへはデプロイしません。

| 対象                   | Worker          | URL                                               | D1                |
| ---------------------- | --------------- | ------------------------------------------------- | ----------------- |
| 公開サイト・学習サイト | `atlasez01`     | `https://atlasez.org` / `https://www.atlasez.org` | `atlasez-reports` |
| 運営用サイト           | `atlasez-admin` | `https://admin.atlasez.org`                       | `atlasez-reports` |

## 正規の手順

1. `main`へマージする前にCIを通す
2. ローカルで `npm run verify:deploy-config` を実行する
3. 公開サイトは `npm run deploy:public`
4. 運営用サイトは `npm run deploy:admin`
5. Chromeで公開サイト、`/admin/portal/`、`/admin/member-calendar/`、`/admin/manage/?project=atlas`を確認する

ADMINのCloudflare Workers Buildsは、GitHub `Atlasez/Admin-Atlesez` の`main`だけをProduction branchとして使用する。Dashboard Editorからの手動Upload、Workers.dev URLの確認、ローカルfeature branchからの直接デプロイは本番手順ではない。Build cacheは無効のまま維持する。

各ビルドは`/build-info.json`へcommit SHAを埋め込む。デプロイ後に対象SHAと一致しない場合は、本番完了とみなさず停止する。

デプロイコマンドには本番ターゲット検証が組み込まれているため、Worker名・アカウント・ルート・D1が違う設定では停止します。CIでも同じ検証を実行します。

## ビルド設定

本番ビルドでは次を固定します。

```bash
SITE_URL=https://atlasez.org
BASE_PATH=/
```

`main`以外のプレビューは検索インデックスに入らないよう`noindex`になります。公開前に本番URLへ向けてビルドし直してください。

## デプロイ後の最低確認

```bash
curl -fsS https://atlasez.org/robots.txt
curl -fsS https://atlasez.org/sitemap-0.xml
```

さらにChromeのログイン済みセッションで、管理トップにカレンダー・応募管理・運営者・担当管理・閲覧統計が表示されることを確認します。

## ロールバック

Workerの直前バージョンへ戻す場合は、Cloudflare WorkersのVersionsから対象Workerを選び、正しいWorker名を確認してロールバックします。別アカウントのWorkerへ切り替える操作は行いません。
