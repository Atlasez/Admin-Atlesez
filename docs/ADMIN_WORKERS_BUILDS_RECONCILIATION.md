# ADMIN配信をWorkers Buildsへ統一する提案

## 現状と適用範囲

ユーザーが今回指定したAGENTS.mdは、通常配信をCloudflare Workers Buildsに限定している。一方、作業開始時のmainの`ADMIN_DEPLOYMENT_POLICY.md`、`ADMIN_CHANGE_WORKFLOW.md`、`DEPLOYMENT.md`、`ADMIN_KNOWLEDGE_BASE.md`と`deploy-admin-from-github.yml`はGitHub Actions配信を定めていた。このPRではユーザー指定を優先し、文書とWorkflowを一組としてWorkers Buildsへ統一する。ローカルの変更をmain反映済みと扱わない。

この文書は切替案であり、配信設定の変更・接続保存・本番migration・本番デプロイを実行した記録ではない。接続画面で`Atlasez/Admin-Atlesez`と`main`が候補に表示されたことは、接続成功やBuildの動作確認を意味しない。

| 対象               | 固定値                                                     |
| ------------------ | ---------------------------------------------------------- |
| GitHub正本         | `Atlasez/Admin-Atlesez` / `main`                           |
| Cloudflare Account | `812021e62fa20465950b61be55dfe064`                         |
| Worker / config    | `atlasez-admin` / `wrangler.admin.jsonc`                   |
| Production URL     | `https://admin.atlasez.org`                                |
| D1                 | `atlasez-reports` / `d5112a62-7ed6-49c8-b6a2-18ee2dbab678` |
| Durable Object     | `atlasez-editorial-collaboration`                          |

公開Worker、Route、Account、D1、DOの付替えは切替の対象に含めない。

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

コードのrollbackは、固定Workerの対象Versionとmain由来SHA、D1互換性、影響をレビューして確定する。Route変更・cache purge・別Workerへの付替えで代替しない。追加済みD1データを安易に削除しない。

Workers Buildsが使えず緊急例外が必要な場合は、ユーザー指定のAGENTS.mdに従い、レビュー済みmain SHA・理由・影響・復旧方法を記録し、そのSHAの手動配信に対する明示承認を得る。cleanなmain checkoutから承認SHAをリテラル指定する。通常の機能修正・本番反映の依頼を緊急local deployの個別承認として扱わない。
