# Cloudflare stale build incident

## 概要

管理サイトのPRがGitHub `main`へMerge済みでも、`admin.atlasez.org`の配信成果物が古いSHAのまま残る事象を記録する。GitHubのMerge成功と本番反映成功を同一視しないための運用記録である。

## 原因

- 正本Worker `atlasez-admin` のCloudflare DashboardでGitリポジトリが未接続だった。
- 本番の最新VersionはWorkers Buildsではなく、手動Wrangler経路から作成されていた。
- Merge後に公開`build-info.json`と`main`のSHAを必須の反映確認として扱う自動ガードがなかった。

## 再発防止

1. Cloudflare Workers Buildsを`Atlasez/Admin-Atlesez`の`main`へ接続する。
2. Build commandは`npm ci && ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ npm run build`、Deploy commandは`npx wrangler deploy --config wrangler.admin.jsonc --keep-vars`に固定する。
3. 手動Wrangler DeployのGitHub Actions workflowを置かない。緊急時は`docs/ADMIN_DEPLOYMENT_POLICY.md`の例外手順を使う。
4. `verify-admin-production.yml`でMerge後の公開`build-info.json`と対象`main` SHAを照合する。不一致は失敗として残し、本番反映済みと報告しない。
5. VersionのWorker名・100%配信・Source・作成時刻と、公開SHAを記録する。

## 2026-09-29時点の状態

Dashboardで正規接続を試みたが、フォーム送信時に内部エラーが返り、接続完了は確認できていない。したがってWorkers Buildsの復旧は未完了であり、Cloudflare側の接続処理を再試行・サポート確認するまで本番反映済みとは扱わない。
