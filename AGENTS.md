# Atlasez ADMIN repository rules

このリポジトリを変更するAgentは、作業開始前に必ず次を読む。

1. `git status`
2. [`docs/ADMIN_DEPLOYMENT_POLICY.md`](docs/ADMIN_DEPLOYMENT_POLICY.md)
3. [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
4. [`docs/ADMIN_KNOWLEDGE_BASE.md`](docs/ADMIN_KNOWLEDGE_BASE.md)

## 本番の固定事項

- ADMIN本番は `admin.atlasez.org` の Cloudflare Worker `atlasez-admin`。
- Cloudflare Account IDは `812021e62fa20465950b61be55dfe064`。
- ADMINのD1は `atlasez-reports` / `d5112a62-7ed6-49c8-b6a2-18ee2dbab678`。
- GitHub Pages、別Worker、Workers.dev URLはADMIN本番ではない。
- 旧Worker名、推測したAccount、別Routeへは絶対にデプロイしない。

## 絶対ルール

- 本番の正本はGitHub `main`。作業ツリー、feature branch、未コミット変更から本番へ出さない。
- 本番経路は、GitHub `main`をProduction branchに固定したCloudflare Workers Buildsだけにする。
- Dashboard Editorからの手動Upload、`wrangler versions upload`、ローカルfeature branchからの直接deployを通常運用で行わない。
- `npm run verify:deploy-config` と `npm run build` を通し、`dist/build-info.json` のSHAを検証してからデプロイする。
- デプロイ後はCloudflare Version/DeploymentのWorker名・100%配信・時刻を確認し、認証済みChromeで主要ADMIN画面を確認する。
- SHA不一致、Worker名不一致、想定外のVersion、古い画面、CI失敗を見つけたら停止する。rollback、promote、cache purge、Route変更を推測で実行しない。
- 既存の未コミット変更を破棄、reset、上書きしない。

## 作業完了条件

変更後は、変更範囲に応じて次を実行し、結果を報告する。

```bash
npm run verify:deploy-config
npm run check
npm run lint
npm test
npm run format:check
SITE_URL=https://atlasez.org BASE_PATH=/ npm run build
npm run verify:build-info
git diff --check
```

Cloudflareの設定変更を伴う場合は、先にPRで設定値・影響・復旧方法をレビューする。Cloudflareの本番設定を変更しただけで完了とせず、Chromeで `admin.atlasez.org` のログイン、ポータル、カレンダー、タスク、マイページ、管理画面を確認する。
