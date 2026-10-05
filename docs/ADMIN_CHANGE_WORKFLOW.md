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

ADMIN本番の唯一の通常デプロイ経路はCloudflare Workers Buildsで、repositoryを`Atlasez/Admin-Atlesez`、Production branchを`main`、Workerを`atlasez-admin`に固定する。PRのCI成功・レビューをmainマージ条件とし、Build側でも検証を成功条件にする。

```bash
# Workers Builds: Build command
npm ci && npm run verify:deploy-config && npm run check && npm run lint && npm test && npm run format:check && ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ CF_BRANCH=main npm run build && npm run verify:build-info && npx wrangler deploy --dry-run --config wrangler.admin.jsonc --keep-vars

# Workers Builds: Deploy command
npx wrangler deploy --config wrangler.admin.jsonc --keep-vars
```

Build checkoutのHEAD、接続Production branch、build-infoのcommit/ref/targetを照合する。任意SHAを固定してmetadataを上書きしない。既存bindings・varsを維持し、Account・Worker・repository・branch・コマンド・影響・復旧方法を接続前にレビューする。

`.github/workflows/deploy-admin-from-github.yml`は検証専用で、main CI成功後にbuild/dry-run/artifact保存だけを行う。production Environment、deploy job、Cloudflare書き込みtokenは持たない。切替PRをmainへ反映しても旧定義で待機・実行中のrunは残るため、別途停止・記録してからWorkers Buildsを接続する。詳細は[`ADMIN_WORKERS_BUILDS_RECONCILIATION.md`](ADMIN_WORKERS_BUILDS_RECONCILIATION.md)を参照する。

D1 migrationは通常Build/Deployに含めない。バックアップ・旧Workerと共有D1への影響・復旧手順をレビューし、新Workerに必要なmigrationの適用記録を先に確定する。今回の0127・0128・0129が未適用なら、Build接続・初回配信を進めない。

接続が正常な場合だけ、レビュー・CI成功後のmainマージでBuildを起動する。Git接続保存だけを完了扱いにせず、Workers Builds run ID・checkout SHA・成功時刻・固定Worker Version・100%配信・build-infoを記録する。Workers Buildsが使えない緊急時だけ、[`ADMIN_DEPLOYMENT_POLICY.md`](ADMIN_DEPLOYMENT_POLICY.md)の対象SHAへの明示承認を得て、cleanなmain checkoutから`npm run deploy:admin`を実行できる。SHAはその場でHEADから生成せず、レビュー済みmain commitに対して明示承認された40桁値をリテラル指定する。

デプロイ後、次を確認してから完了とする。

```bash
curl -fsS https://admin.atlasez.org/build-info.json
npx wrangler deployments list --config wrangler.admin.jsonc
npx wrangler versions list --config wrangler.admin.jsonc
```

`build-info.json.commit`がマージした`main`のSHAと一致し、Versionが`atlasez-admin`のProductionへ100%配信されていなければ停止する。監査JSONだけのmain advanceを許容する場合も、公開SHAの祖先関係と差分が`docs/deployments/cloudflare-latest.json`だけであることを検証する。

## 6. 現在のCloudflare連携障害時

Workers Buildsが未接続・内部エラー・CI失敗・SHA不一致なら配信を停止し、PR/Issueにrun ID・時刻・対象SHA・固定Worker・停止理由を記録する。

- Actions deployの再開、Dashboard Editor、別Worker、Route変更、Versionsのpromote/rollback、cache purgeを推測で行わない。
- `main`でないbranch・未コミット変更から本番へ出さない。
- 緊急手動配信が必要な場合は、対象SHA、理由、承認者、影響、復旧方法を記録し、別途明示承認とclean mainガードを満たす。
- Workers Builds復旧後の最初の配信はrun・checkout SHA・Version ID・時刻・Chrome結果を記録する。
- `verify-admin-production.yml`はschedule/dispatchで固定URLを読み取る。最大15回、60秒間隔、job20分以内に一致を確認できなければ失敗とする。待機中のActions runを照合省略や成功の根拠にしない。

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
