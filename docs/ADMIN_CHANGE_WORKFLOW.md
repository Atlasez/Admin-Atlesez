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

`.github/workflows/deploy-admin-from-github.yml`をADMIN本番の唯一の通常デプロイ経路とする。mainのCI成功後に`production` Environmentの承認が必要で、workflowはmainのHEADが対象SHAから進んでいないことを確認してから配信する。変更が`docs/deployments/cloudflare-latest.json`だけなら本番配信を省略する。Cloudflare Workers Buildsを併用しない。Build設定は次に固定する。

```bash
# Build command
npm ci && ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ npm run build

# Deploy command
npx wrangler deploy --config wrangler.admin.jsonc --keep-vars
```

PRのCI成功後にmainへマージし、main pushに対するCI全成功後にGitHub Actionsのdeploy workflowを起動する。production Environment承認後に配信する。WorkflowはD1 migrationを実行せず、build artifactのSHA・Worker名・100%配信・公開build-infoを検証する。Cloudflare Workers Buildsを再接続する場合は、GitHub Actions deployを先に止め、運用方針をPRで切り替える。GitHub Actionsも利用できない緊急時に限り、[`ADMIN_DEPLOYMENT_POLICY.md`](ADMIN_DEPLOYMENT_POLICY.md)の承認を得て、`npm run deploy:admin`をcleanな`main` checkoutから実行できる。このローカルガードは明示承認SHA、remote main由来、clean worktree、ADMIN向けbuild-infoを検証する。SHAはその場でHEADから生成せず、レビュー済みmain commitに対して明示承認された40桁値を指定する。

デプロイ後、次を確認してから完了とする。

```bash
curl -fsS https://admin.atlasez.org/build-info.json
npx wrangler deployments list --config wrangler.admin.jsonc
npx wrangler versions list --config wrangler.admin.jsonc
```

`build-info.json.commit`がマージした`main`のSHAと一致し、Versionが`atlasez-admin`のProductionへ100%配信されていなければ停止する。例外は監査JSONだけを変更したMergeで、この場合はbuild-infoが直前のコードdeploy SHAを指し続けることを確認する。

## 6. 現在のCloudflare連携障害時

Cloudflare DashboardのGit repository接続が「内部エラー」で失敗している間は、承認済みGitHub Actions経路を使う。Cloudflare BuildsとActionsの二重配信は避け、Workers Builds接続を再試行する前にGitHub Actions deployを無効化する。

- main merge後はdeploy workflowとproduction Environmentの承認を確認し、検証完了までは本番反映済みと報告しない。
- `main`でないbranchから`wrangler deploy`しない。
- GitHub Actionsのdeploy workflowが失敗したらrun logとIssueを記録する。D1 migration、別worker、Cloudflare Editorを使って穴埋めしない。
- Dashboard Editor、Versionsのpromote、rollback、cache purgeで穴埋めしない。
- 緊急手動デプロイが必要な場合は、対象SHA、理由、承認者、影響、復旧方法をIssueに記録してから別途明示承認を得て、cleanでremote main由来の`main` checkoutから`npm run deploy:admin`を実行する。
- GitHub Actionsが復旧した後は、最初の1回を監視デプロイとし、SHA、Version ID、時刻、Chrome結果を記録する。

## 7. 本番相当のライブスモーク

認証済みChromeから保存したPlaywright Storage Stateを渡すと、ローカルのモックではなく指定したADMIN URLへ主要画面を確認できる。通常のE2Eでは実行されず、`E2E_LIVE_SMOKE=1`を明示した場合だけ有効になる。

```bash
E2E_LIVE_SMOKE=1 \
E2E_BASE_URL=https://admin.atlasez.org \
E2E_AUTH_STORAGE_STATE=/absolute/path/admin-auth.json \
npm run test:e2e:admin-live
```

Storage StateにはCookieやトークンが含まれるため、リポジトリへ保存せず、共有端末では実行後に削除する。`build-info.json`のrepository・target・commitと、ポータル、タスク、カレンダー、マイページ、管理トップ、記事一覧のHTTP応答・認証遷移を検証する。認証状態を用意できない場合は、Chromeで同じURLを手動確認し、ライブスモークを成功扱いにしない。

## 8. Chrome確認

認証済みChromeで、少なくとも次を確認する。

- `/admin/portal/`
- `/admin/member-tasks/`
- `/admin/member-calendar/`
- `/admin/member-profile/`
- `/admin/manage/?project=atlas`
- `/admin/articles/`または変更対象画面

ログイン状態、主要見出し、変更対象のDOM、ブラウザコンソール相当の明らかなエラー、`build-info.json`のSHAを確認する。古い画面、想定外のドメイン、SHA不一致、認証エラーがあれば成功扱いにしない。
