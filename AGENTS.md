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

- 本番の正本はGitHub `main`。`main`以外の作業ツリー、feature branch、未コミット変更から本番へ出さない。
- 通常の本番経路は、GitHub `main`をProduction branchに固定したCloudflare Workers Buildsだけにする。`.github/workflows/deploy-admin-from-github.yml`は検証専用で、配信job・production Environment・Cloudflare書き込みtokenを持たせない。
- Dashboard Editorからの手動Upload、`wrangler versions upload`、ローカルfeature branchからの直接deployを通常運用で行わない。
- `npm run verify:deploy-config`、対象に合ったbuild設定での `npm run build`、`npm run verify:build-info` を通してからデプロイする。ADMINは `ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/`、公開サイトは `SITE_URL=https://atlasez.org BASE_PATH=/` を使う。
- 手動の緊急デプロイはWorkers Buildsが使えず、レビュー済みmain commitを本番へ出す明示承認がある場合だけ許可する。cleanな`main` checkoutから、承認済みSHAをリテラルで`DEPLOY_MAIN_SHA`に指定する。スクリプトはbranch、remote main由来、未コミット変更、SHA一致を検証し、feature branch・detached HEAD・SHA省略を停止する。
- 通常Build/DeployではD1 migrationを自動適用しない。DB変更はバックアップ・PRレビュー・明示したmigration手順で別に扱い、新Workerの配信前に必要なmigration適用を記録する。
- デプロイ後はWorkers Buildsのrun・checkout SHA、Cloudflare Version/DeploymentのWorker名・100%配信・時刻を照合し、公開`build-info.json`のSHA一致と認証済みChromeで主要ADMIN画面を確認する。同期PRだけのSHA差分を許容する場合は、公開build-infoのSHAがmainの祖先で、差分が`docs/deployments/cloudflare-latest.json`だけであることを読み取り専用検証で確認する。Workers Buildsが監査PRを配信しても対象main SHAの一致を確認する。
- 同期記録以外のSHA不一致、Worker名不一致、想定外のVersion、古い画面、CI失敗を見つけたら停止する。rollback、promote、cache purge、Route変更を推測で実行しない。
- 既存の未コミット変更を破棄、reset、上書きしない。

## 通常の変更フロー

1. `main`を最新化し、作業開始時の`git status`を記録する。
2. `codex/`または目的が分かるfeature branchを`main`から作る。既存の作業ツリーを流用しない。
3. 変更対象に対応するテストを先に確認し、実装後にCI相当の検証を実行する。
4. PR本文に、変更内容、対象URL、データ／Worker影響、検証結果、ロールバック方法を記載する。
5. CI成功とレビュー完了後にだけ`main`へマージする。マージ前のbranch、ローカル`dist/`、Dashboard Editorの成果物を本番へ出さない。
6. Cloudflare Workers Buildsが正常接続されている場合だけ、レビュー・CI成功後の`main`へのマージをトリガーに本番ビルドする。
7. デプロイ後に`build-info.json`のSHA、Cloudflare Version、100%配信、Chromeの主要画面を確認する。

## Cloudflare展開監査

- `.github/workflows/cloudflare-deployment-sync.yml`が15分ごとにCloudflareのDeployment/Versionと公開`build-info.json`を読み取り、差分がある場合だけGitHubへ同期PRを作る。
- 同期PRは本番コードの正本ではなく監査証跡である。`Source: Unknown`、SHA不一致、`build-info.json`欠落は自動Mergeせず、インシデントとして調査する。
- 監査JSONだけのmain advanceを許容する場合も、直前のbuild-info SHAからmainまでの祖先関係とファイル差分を検証する。対象SHAを推測で成功扱いしない。
- 同期WorkflowはCloudflareへ書き込まない。Cloudflare API TokenはWorkers Scripts Readだけを持つ読み取り専用Tokenにする。

Workers Buildsが未接続・内部エラー・CI失敗・SHA不一致のいずれかなら、変更を本番へ出さず、PRまたはIssueに停止理由を記録する。切替時は検証専用Workflowをmainへマージし、旧定義で待機・実行中のActions deployを別途停止・記録してから接続する。方針・順序は[`docs/ADMIN_WORKERS_BUILDS_RECONCILIATION.md`](docs/ADMIN_WORKERS_BUILDS_RECONCILIATION.md)を参照する。

## 作業完了条件

変更後は、変更範囲に応じて次を実行し、結果を報告する。

```bash
npm run verify:deploy-config
npm run check
npm run lint
npm test
npm run format:check
ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ npm run build
npm run verify:build-info
git diff --check
```

Cloudflareの設定変更を伴う場合は、先にPRで設定値・影響・復旧方法をレビューする。Cloudflareの本番設定を変更しただけで完了とせず、Chromeで `admin.atlasez.org` のログイン、ポータル、カレンダー、タスク、マイページ、管理画面を確認する。
