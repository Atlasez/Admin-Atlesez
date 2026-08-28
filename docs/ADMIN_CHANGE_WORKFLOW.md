# ADMIN変更・レビュー・デプロイ手順

この文書は、ADMINサイトの修正を安全に本番へ届けるためのAgent向け実行手順である。固定値と停止条件は[`ADMIN_DEPLOYMENT_POLICY.md`](ADMIN_DEPLOYMENT_POLICY.md)を正本とする。

## 1. 何をどこで変更するか

- ADMIN本番の正本はGitHub `Atlasez/Admin-Atlesez` の`main`。
- 本番URLは`https://admin.atlasez.org`だけ。Workerは`atlasez-admin`。
- ページ、Worker、CSS、テスト、設定はGitHubのPRで変更する。
- Cloudflare Dashboard Editorでコードを直接変更しない。
- D1 migrationを伴う場合は、migration番号、適用順、既存データへの影響、復旧方法をPR本文に書く。D1を本番で直接変更しない。

## 2. 修正の開始

```bash
git status
git fetch --all --prune
git switch main
git pull --ff-only
git switch -c codex/<目的>-YYYYMMDD
```

作業開始時に未コミット変更があれば、破棄・reset・上書きせず、別worktreeで作業する。ユーザーの既存変更をPRへ混ぜない。

## 3. 修正後の必須確認

変更範囲に応じて最低限、次を実行する。

```bash
npm ci
npm run verify:deploy-config
npm run check
npm run lint
npm test -- --run
npm run format:check
ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ npm run build
npm run verify:build-info
git diff --check
```

E2E対象を変更した場合は、`npm run test:e2e`も実行する。CIが一つでも失敗した場合はマージしない。

## 4. PRとマージ

PR本文に必ず次を記載する。

- 変更の目的と対象画面
- 破壊的変更、認証、D1、Durable Object、公開APIへの影響
- 実行したコマンドと結果
- Cloudflareへの影響があるか
- デプロイ後にChromeで確認するURL
- 問題発生時に止める条件と復旧手順

レビュー済み、CI成功、競合なしを確認してから`main`へマージする。CI失敗を無視するためのテスト削除、期待値の緩和、force push、直接マージは禁止する。

## 5. 本番デプロイ

Cloudflare Workers Buildsが接続済みで、Production branchが`main`に固定されている場合だけ、マージ後の自動ビルドを本番経路とする。Build commandとDeploy commandは次の固定値から変更しない。

```bash
# Build command
npm ci && ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ npm run build

# Deploy command
npx wrangler deploy --config wrangler.admin.jsonc --keep-vars
```

デプロイ後、次を確認してから完了とする。

```bash
curl -fsS https://admin.atlasez.org/build-info.json
npx wrangler deployments list --config wrangler.admin.jsonc
npx wrangler versions list --config wrangler.admin.jsonc
```

`build-info.json.commit`がマージした`main`のSHAと一致し、Versionが`atlasez-admin`のProductionへ100%配信されていなければ停止する。

## 6. 現在のCloudflare連携障害時

Cloudflare DashboardのGit repository接続が「内部エラー」で失敗している期間は、通常の本番デプロイを行わない。Cloudflareの現在のVersionが手動Uploadで、GitHub SHAと自動的に結び付かないためである。

- PRをマージしただけでは本番反映済みと報告しない。
- `main`でないbranchから`wrangler deploy`しない。
- Dashboard Editor、Versionsのpromote、rollback、cache purgeで穴埋めしない。
- 緊急手動デプロイが必要な場合は、対象SHA、理由、承認者、影響、復旧方法をIssueに記録してから、別途明示承認を得る。
- Workers Builds復旧後は、最初の1回を監視デプロイとし、SHA、Version ID、時刻、Chrome結果を記録する。

## 7. Chrome確認

認証済みChromeで、少なくとも次を確認する。

- `/admin/portal/`
- `/admin/member-tasks/`
- `/admin/member-calendar/`
- `/admin/member-profile/`
- `/admin/manage/?project=atlas`
- `/admin/articles/`または変更対象画面

ログイン状態、主要見出し、変更対象のDOM、ブラウザコンソール相当の明らかなエラー、`build-info.json`のSHAを確認する。古い画面、想定外のドメイン、SHA不一致、認証エラーがあれば成功扱いにしない。
