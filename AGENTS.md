# Atlasez ADMIN repository rules

このリポジトリを変更するAgentは、作業開始前に必ず次を読む。

1. `git status`
2. [`docs/ADMIN_DEPLOYMENT_POLICY.md`](docs/ADMIN_DEPLOYMENT_POLICY.md)
3. [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
4. [`docs/ADMIN_KNOWLEDGE_BASE.md`](docs/ADMIN_KNOWLEDGE_BASE.md)
5. [`docs/ADMIN_CHANGE_WORKFLOW.md`](docs/ADMIN_CHANGE_WORKFLOW.md)

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
- 手動の緊急デプロイでは、cleanなmain固定SHAから `DEPLOY_MAIN_SHA=$(git rev-parse HEAD) npm run deploy:admin` のように明示承認SHAを渡す。feature branch、未コミット変更、SHA省略のDeployはスクリプトで停止する。
- デプロイ後はCloudflare Version/DeploymentのWorker名・100%配信・時刻を確認し、認証済みChromeで主要ADMIN画面を確認する。
- SHA不一致、Worker名不一致、想定外のVersion、古い画面、CI失敗を見つけたら停止する。rollback、promote、cache purge、Route変更を推測で実行しない。
- 既存の未コミット変更を破棄、reset、上書きしない。

## 通常の変更フロー

1. `main`を最新化し、作業開始時の`git status`を記録する。
2. `codex/`または目的が分かるfeature branchを`main`から作る。既存の作業ツリーを流用しない。
3. 変更対象に対応するテストを先に確認し、実装後にCI相当の検証を実行する。
4. PR本文に、変更内容、対象URL、データ／Worker影響、検証結果、ロールバック方法を記載する。
5. CI成功とレビュー完了後にだけ`main`へマージする。マージ前のbranch、ローカル`dist/`、Dashboard Editorの成果物を本番へ出さない。
6. Cloudflare Workers Buildsが正常接続されている場合だけ、`main`のマージをトリガーに本番ビルドする。
7. デプロイ後に`build-info.json`のSHA、Cloudflare Version、100%配信、Chromeの主要画面を確認する。

## Cloudflare展開監査

- `.github/workflows/cloudflare-deployment-sync.yml`が15分ごとにCloudflareのDeployment/Versionと公開`build-info.json`を読み取り、差分がある場合だけGitHubへ同期PRを作る。
- 同期PRは本番コードの正本ではなく監査証跡である。`Source: Unknown`、SHA不一致、`build-info.json`欠落は自動Mergeせず、インシデントとして調査する。
- 同期WorkflowはCloudflareへ書き込まない。Cloudflare API TokenはWorkers Scripts Readだけを持つ読み取り専用Tokenにする。

Workers Buildsが未接続・内部エラー・CI失敗・SHA不一致のいずれかなら、変更を本番へ出さず、PRまたはIssueに停止理由を記録する。

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
