# ADMIN配信をWorkers Buildsへ統一する提案

## 現状と適用範囲

ユーザーが今回指定したAGENTS.mdは、通常配信をCloudflare Workers Buildsに限定している。一方、作業開始時のmainの`ADMIN_DEPLOYMENT_POLICY.md`、`ADMIN_CHANGE_WORKFLOW.md`、`DEPLOYMENT.md`、`ADMIN_KNOWLEDGE_BASE.md`と`deploy-admin-from-github.yml`はGitHub Actions配信を定めていた。このPRではユーザー指定を優先し、文書とWorkflowを一組としてWorkers Buildsへ統一する。ローカルの変更をmain反映済みと扱わない。

このPRは切替案と復旧記録を更新するもので、Cloudflareの配信設定を変更・保存しない。接続画面で`Atlasez/Admin-Atlesez`と`main`が候補に表示されたことは、接続成功やBuildの動作確認を意味しない。2026-10-09に実施した本番復旧は、Workers Builds接続とは独立した、ユーザー指定AGENTS.mdに定める緊急経路の記録として以下に記載する。

| 対象               | 固定値                                                     |
| ------------------ | ---------------------------------------------------------- |
| GitHub正本         | `Atlasez/Admin-Atlesez` / `main`                           |
| Cloudflare Account | `812021e62fa20465950b61be55dfe064`                         |
| Worker / config    | `atlasez-admin` / `wrangler.admin.jsonc`                   |
| Production URL     | `https://admin.atlasez.org`                                |
| D1                 | `atlasez-reports` / `d5112a62-7ed6-49c8-b6a2-18ee2dbab678` |
| Durable Object     | `atlasez-editorial-collaboration`                          |

公開Worker、Route、Account、D1、DOの付替えは切替の対象に含めない。

## 2026-10-08 本番停止の調査記録

Cloudflare DashboardのAccount `812021e62fa20465950b61be55dfe064`にあるWorker `atlasez-admin`のProduction Settingsを確認した。Build欄のGit repositoryは`接続`と表示され、Workers Buildsは未接続だった。現在の構成では、GitHub `main`へのマージだけでADMIN本番は更新されない。これは今回の反映停止の直接原因である。

読み取り専用の本番照合では次を確認した。

- `https://admin.atlasez.org/build-info.json`: commit `cebf65dd17c31d6bdc7f62fc41fdce24f4d336a4`、ref `main`、target `admin`、builtAt `2026-10-05T14:26:26.505Z`。
- GitHub `admin/main`: `28b5f321af4bdd7177c92038935d0a5f1dc2f285`。公開SHAとの差分にはアプリケーションコードとテストの変更がある。
- 最新DeploymentはVersion `aa9766f5-7fda-40f4-97c3-094a776ef1b5`を100%配信中だが、配信元は`Unknown (version_upload)`。build-infoはビルドmetadataであり、このVersionとの独立した紐付け証跡ではない。
- `https://admin.atlasez.org/xai-prototype/`はHTTP 404。
- 旧GitHub deploy Workflowの実行中runはなく、現行Workflowは検証専用。固定D1の読み取り専用migration一覧は`No migrations to apply`。
- UI prototype PR #516はDraft・未レビュー。PR CIは成功しているが、mainへ未反映。

この不一致と停止判断は2026-10-08時点の記録である。2026-10-09の復旧結果は次節に記載する。

## 2026-10-09 本番復旧とWorkers Builds権限の再調査

Cloudflareの権限変更後に再確認し、通常のWorkers Builds接続が未完了のままADMIN本番が古いことを確認した。レビュー済みmain `28b5f321af4bdd7177c92038935d0a5f1dc2f285`だけを使い、ユーザー指定AGENTS.mdの緊急手順で本番を復旧した。作業はcanonical GitHub `main`のclean checkoutで行い、deploy context、config、全検証とADMIN buildを照合した。`CF_BRANCH=main`を指定して再ビルド後に配信し、migration一覧は`No migrations to apply`だった。

- Worker: `atlasez-admin`、Account `812021e62fa20465950b61be55dfe064`、custom domain `admin.atlasez.org`。
- Cloudflare Version: `9ec745ba-3860-4277-ad11-8e476ed1c806`、2026-10-09 11:31:36 UTC、100%配信。
- 公開build-info: repository=`Atlasez/Admin-Atlesez`、commit=`28b5f321af4bdd7177c92038935d0a5f1dc2f285`、ref=`main`、target=`admin`。Build情報はVersion metadataではないため、Worker/Version/100%配信と公開SHAを個別に照合した。
- Cloudflareはsourceを`Unknown (deployment)`と表示した。手動の緊急経路による配信と一致する値で、main由来の根拠には公開build-infoの完全一致を使用した。
- GitHubの読み取り専用 `Verify admin production sync` run [37924656754](https://github.com/Atlasez/Admin-Atlesez/actions/runs/37924656754) は対象main SHAで成功。
- clean checkoutで`verify:deploy-config`、`check`、`lint`、`test`、`format:check`、ADMIN build、`verify:build-info`、`git diff --check`が成功。認証済みChromeでログイン後、ポータル、カレンダー、タスク、マイページ、管理画面、手順画面を確認した。
- Issue [#509](https://github.com/Atlasez/Admin-Atlesez/issues/509) に復旧結果を記録した。

継続的な配信停止の原因もCloudflareの現行権限仕様で再調査した。既存のユーザーtoken `Atlasez ADMIN Workers Builds - fresh`と`Atlasez ADMIN Workers Builds - scoped`はいずれも`Workers Builds Configuration: Edit`と`Workers Scripts: Read`であり、Builds設定APIの構成には使えるがWorkerをdeployする権限はない。CloudflareはWorkers Buildsがuser-scoped tokenのみ対応し、account-owned tokenは未対応と明記している（[Build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[Builds API](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)）。

Cloudflareは2026-09-15にWorker単位のEditor roleを追加し、自動化にはAccount API Tokenを作り、対象Workerだけへscopeする方法を案内している（[Workers roles and permissions](https://developers.cloudflare.com/workers/authorization/workers/)、[role追加の案内](https://developers.cloudflare.com/changelog/post/2026-09-15-granular-worker-permissions/)）。一方、Workers Buildsはaccount-owned tokenに未対応であるため、この最小権限経路を利用できない。

CloudflareのMy Profile > API Tokensで既存tokenとカスタムtoken作成画面を読み取り確認した。既存2 tokenは上記の読み取り権限だった。カスタムユーザーtokenではresourceをAccountまたはZoneから選択する画面で、Accountの`Workers`を選ぶと権限レベルの選択肢は`Admin`のみであり、Worker単体のEditorは設定できなかった。Account API Tokensへの画面遷移は`403 Unauthorized`となり、このユーザーには作成権限もなかった。仮にAccount API Tokenを作成できても、現行Workers Buildsはそれを受け付けない。

Build token作成APIはlegacy `Workers CI Write`を要求する。Cloudflareはlegacy Workers permissionをaccount-levelとし、Workers CI EditおよびWorkers Scripts EditはWorkers product全体のEditorに対応すると説明している。[Workers EditorをWorker単位にscopeする方法](https://developers.cloudflare.com/workers/authorization/workers/)はAccount API Token向けのため、Buildsのuser-token制約と両立しない。したがって、現在のWorkers Buildsでは`atlasez-admin`単体に限定したDeploy tokenを構成できない。

Dashboardが提示する自動tokenは、Worker Scripts Editに加えてKV/R2や全ZoneのRoutesなど広い権限を含むため使用していない。既存の`Atlasez Admin GitHub Deploy`にはアカウント範囲のWorkers Scripts Editに加えてD1権限があるが、これもWorkers Buildsへ渡していない。ユーザー指定AGENTS.mdはWorker単体にscopeできないWorkers Scripts Edit tokenを使う場合、別の明示承認を要求している。アカウント全体へのdeploy権限を持つtokenを新設・選択していないため、Workers Builds接続と継続的自動配信は未完了である。

### 設定レビュー対象

レビュー完了後に設定する値は次のとおり。Cloudflareの設定保存は、PRレビューとその後の権限確認が済むまで行わない。

- GitHub repository: `Atlasez/Admin-Atlesez`
- Production branch: `main`
- Root directory: `/`
- Build command: 本文書の「Workers Buildsのコマンド案」に記載した全検証、ADMIN build、deploy dry-run
- Deploy command: `npx wrangler deploy --config wrangler.admin.jsonc --keep-vars`
- Preview builds: disabled
- Worker名、Account、Custom Domain、D1、Durable Object、bindings、既存vars: 固定値を維持。新しいrouteや別Workerを作らない

この接続は、以後`main`へ入った変更を固定ADMIN Workerへ継続的に配信できる権限を持つ。Dashboardの自動API TokenはWorker以外のアカウント機能とZone Routesまで含むため使わない。現在のWorkers Builds APIではaccount-owned・Worker単位tokenを利用できないため、アカウント全体のWorkers編集権限を含むtokenの作成・選択は、PRレビューと対象・権限・影響・保存先・復旧方法を明示した別のユーザー承認なしに進めない。

### 設定変更時の復旧

初回Buildの前提確認、checkout SHA、全検証、build-info、Worker Version、100%配信を一つでも照合できなければ、以降のmainマージとBuildを止めてrun ID・SHA・Version・時刻を記録する。設定を戻す必要がある場合は、別のレビュー済みPRでWorkers Builds接続を解除し、別の書込み経路は有効にしない。誤ったVersionのpromote/rollback、cache purge、Route変更は対象Versionと影響をレビューするまで行わない。再開は原因を修正したレビュー済みmain commitのWorkers Buildsから行い、build-infoとCloudflare Versionの対応を検証してから完了とする。

## 切替順序

1. 運用文書、AGENTS.md、Actions deploy workflow、配信検証workflow、設定検証の関連テストを変更するPRを作り、CI成功・レビュー完了を確認する。Workers Buildsのみを通常経路とすることと、監査だけのworkflowを残すことを明記する。
2. **レビュー済みの検証専用Workflowをmainへ反映し、GitHub Actionsの本番deployを先に停止する。** Workflow変更だけでは旧定義で開始済みのrunは停止しない。待機中・実行中の本番deployを別途停止し、run ID・終了状態と本番Versionが変わっていないことを記録する。読み取り専用のCloudflare監査workflowは継続する。停止前にWorkers Buildsを接続しない。
3. 固定WorkerのGit接続を設定する。repositoryを`Atlasez/Admin-Atlesez`、Production branchを`main`、root directoryをリポジトリルートに固定する。他branchの自動配信・Preview配信を有効にしない。
4. 設定保存前にAccount、Worker、repository、branch、コマンド、既存bindings・varsの維持をレビューする。接続保存だけで完了にしない。
5. migrationの前提を満たしたレビュー済みmain commitで最初のBuildを監視する。Buildが開始しない・内部エラー・CI失敗・SHA不一致なら停止理由をPR/Issueへ記録し、そのまま配信を止める。

この切替PR自身のmergeでActionsが起動しないよう、停止タイミングとworkflow変更内容をレビューに含める。ActionsとWorkers Buildsの両方が書き込める状態を作らない。

## Workers Buildsのコマンド案

Buildは配信前の全検証を成功条件にする。既存のmain保護でPRのCI成功・レビューを必須にし、Build側でも次を実行する。

```bash
npm ci && npm run verify:deploy-config && npm run check && npm run lint && npm test && npm run format:check && ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ CF_BRANCH=main npm run build && npm run verify:build-info && npx wrangler deploy --dry-run --config wrangler.admin.jsonc --keep-vars
```

Deploy command:

```bash
npx wrangler deploy --config wrangler.admin.jsonc --keep-vars
```

`CF_BRANCH=main`はProduction branch設定と照合する。`build-info.json`のcommitはBuild checkoutのHEADと一致させ、任意のSHAを環境変数に固定して成果物の身元を偽装しない。`scripts/write-build-info.mjs`は`CF_COMMIT_SHA`等が未設定ならGit HEADを使用するため、接続後の最初のBuildで実際のcheckout SHA・branch・生成metadataを確認する。Build環境に既存のcommit/ref変数がある場合は、その値がcheckoutと一致することも確認する。

local緊急例外用の`npm run deploy:admin`をWorkers BuildsのDeploy commandへ流用しない。通常のGit接続と、clean main・承認済みSHAを要求するlocal緊急例外はそれぞれのガードを維持する。

## D1 migrationの前提

今回の実運用機能は`0127_project_member_procedures.sql`、`0128_member_intake_tracking_and_test_tasks.sql`、`0129_project_manager_provenance.sql`を参照する。新Workerを出す前に次を別のmigration手順としてレビュー・記録する。

- 未適用migration一覧、適用順、共有D1を利用する公開Workerへの影響。
- 事前バックアップと復旧方法。0127の申請テーブル再作成・既存行コピー、0128の追加列/テーブル、0129の権限由来テーブルのデータ保持を確認する。
- 隔離D1での既存データ保持、外部キー、旧Workerとの互換性、検証結果。
- 固定D1への適用日時・実施者・結果。通常のBuild/Deploy commandにmigrationを混ぜない。

バックアップやmigration適用が未確認のまま、main mergeによる自動Buildを起動しない。配信開始の順序をPRに明記し、migration未適用ならBuildを停止したままにする。

## 配信後の証拠と停止条件

次を同じ記録に残す。ログは秘密情報を除いて保存する。

1. レビュー済みmain SHA、GitHub CI、Workers Buildsのrun ID・checkout SHA・成功時刻。
2. `https://admin.atlasez.org/build-info.json`のrepository=`Atlasez/Admin-Atlesez`、ref=`main`、target=`admin`、commitと対象main SHAの一致。
3. CloudflareのWorker=`atlasez-admin`、Version ID、Deployment時刻、対象Versionの100%配信。
4. 認証済みChromeでログイン・ポータル・メンバー用タスク・カレンダー・マイページ・管理画面と今回の対象画面。対象プロジェクト責任者と通常メンバーの権限境界を確認する。

SHA・Worker・Version・100%配信・画面のいずれかが一致しない場合は、新しい配信を停止し、PR/IssueにURL・時刻・run・Version・SHAを記録する。画面だけが新しいことやGit接続保存だけを成功扱いしない。監査JSONだけのmain変更を例外にする場合も、差分と直前のコード配信SHAの証拠を残す。

`verify-admin-production.yml`は同じPRでdeploy workflow依存を除去し、schedule/dispatchから固定本番URLとその時点のmainを読み取り専用で照合する。最大15回・60秒間隔・job全体20分以内とし、待機中Actions runを理由に照合を省略しない。照合中にmainが進んだ場合は新しいSHAを取得して比較し直す。このWorkflowだけではWorkers Buildsのrun・Version・100%配信・Chromeの確認は完了しないため、上記の証拠を別途記録する。Cloudflare展開監査は読み取り専用Tokenを維持し、同期PRを配信元や自動復旧手段にしない。

## 復旧

接続失敗時にActionsを推測で再開しない。以前の配信方式に戻す必要がある場合は、Workers Buildsを先に停止し、対象設定・影響・復旧方法をレビューした別PRで切り替える。二経路の同時有効化は禁止する。

コードのrollbackは、固定Workerの対象Versionとmain由来SHA、D1互換性、影響をレビューして確定する。特にmigration 0127以降のメンバー停止状態、試験タスクの`is_test_data`、付与元付き運営権限が本番D1へ入った後は、それらを認識しない旧Workerへ単純に戻さない。旧Workerは休止・退会した人のアクセスを再開し、試験タスクを通常データとして表示・通知する可能性がある。復旧先はこれらの状態を尊重する互換版に限定するか、状態を保護するレビュー済みの復旧コードと確認手順を別PRで用意する。Route変更・cache purge・別Workerへの付替えで代替しない。追加済みD1データを安易に削除しない。

Workers Buildsが使えず緊急例外が必要な場合は、ユーザー指定のAGENTS.mdに従い、レビュー済みmain SHA・理由・影響・復旧方法を記録し、そのSHAの手動配信に対する明示承認を得る。cleanなmain checkoutから承認SHAをリテラル指定する。通常の機能修正・本番反映の依頼を緊急local deployの個別承認として扱わない。
