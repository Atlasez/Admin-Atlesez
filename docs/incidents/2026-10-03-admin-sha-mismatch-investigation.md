# ADMIN本番SHA不一致の原因調査報告書

調査日: 2026-10-03（JST）。追跡: [Issue #407](https://github.com/Atlasez/Admin-Atlesez/issues/407)。対象: Cloudflare Account `812021e62fa20465950b61be55dfe064`、Worker `atlasez-admin`、`https://admin.atlasez.org`、正本GitHub `Atlasez/Admin-Atlesez/main`。

## 1. 結論

**確認できた直接原因は、GitHub mainの更新を本番へ届ける自動経路が現在成立していないこと。Cloudflare設定や権限をユーザーが変更したことを原因とする証拠はない。**

以前はGitHub Actionsの`Deploy admin from GitHub`がmainへのpushで本番を更新していた。しかしGitHub側の変更で、2026-09-27に手動実行限定となり、2026-09-29には廃止された。代替の正規経路であるWorkers Buildsは未接続のままである。Cloudflareの設定が変わらなくても、GitHub側のトリガーをなくせばmainの新しいcommitは配信されない。

2026-09-29の例外手動デプロイでは当時のmainと本番SHAが一度一致した。その後はmainだけが更新され、本番は同じVersionを配信している。今回の繰り返す不一致は、SHAが勝手に変化する現象ではなく、**固定された配信SHAと更新され続けるmainの差**で説明できる。

Workers Builds接続を妨げる現在の権限不足は別の問題である。過去の接続試行には`Account Settings Read`不足の記録があり、今回のMembers画面も`DNS, Workers Platform Admin`と表示する。ただし、いつ誰が権限を変更したか、以前と同一の権限であったかは未確定。Cloudflare監査ログは閲覧拒否され、権限変更の有無を検証できなかった。ユーザーの「以前から設定や権限を変更していない」という説明と、今回確定した直接原因は矛盾しない。

## 2. 今回直接確認した証拠

確認時刻は2026-10-03 03:03〜03:08 JST。GitHubの比較基準は調査開始時のmainに固定する。

| 項目                           | 確認結果                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 正本main                       | `c90ad3584fac538dfd87855ba805751ef1a5b462`（PR #491）                                                                 |
| 本番build-info.commit          | `74084dc6147490fef228b6a1f68ae3fedae79ba7`（PR #474のmerge commit）                                                   |
| 本番build-info                 | repository `Atlasez/Admin-Atlesez`、target `admin`、ref `unknown`、builtAt `2026-09-29T10:57:48.705Z`（19:57:48 JST） |
| Cloudflare現在のActive Version | Dashboardで`2f9440ea`、トラフィック100%                                                                               |
| Version ID / Deployment ID     | 監査PR #304の記録と一致: `2f9440ea-e4e3-4689-89d0-c8d27ac7d95f` / `a859e353-b64d-4087-b109-10e2070a8f47`              |
| Deployment作成時刻             | 監査記録: `2026-09-29T10:57:59.445802Z`（19:57:59 JST）                                                               |
| Cloudflareの経路表示           | DashboardのVersion履歴は「手動で展開 / Wrangler」、API監査記録は`source: wrangler`                                    |
| Workers Builds                 | 設定に「Git リポジトリ / 接続」、最近のビルドに「このワーカーのビルドはまだ存在しません」                             |
| Runtime Cache                  | Dashboardでは「無効」。Build cacheとは別項目であり、これだけでBuild cacheの状態は判断しない                           |
| 現在のアカウントロール         | Members画面の1名のアクティブ行に`DNS, Workers Platform Admin`                                                         |
| Cloudflare監査ログ             | 「アクセス不可」「このページを閲覧する権限がありません」                                                              |

build-infoは通常URLと、独立した`deployment_audit`クエリを付け`Cache-Control: no-cache` / `Pragma: no-cache`を送る取得の両方で同じ旧SHAを返した。どちらもHTTP 200、`cf-cache-status: HIT`、`cache-control: no-store, max-age=0, must-revalidate`、ETag `fb1cbe117d90f1fa8acf83471cdde9bf`。CF-Rayは通常取得`a445a0009a96ccea-NRT`、クエリ付き`a445a17c896e2669-NRT`。HTTPのHIT表示だけでは古い別Versionのキャッシュが残ったとは判断できない。現在のActive Version自体が9月29日のままであり、今回キャッシュを主因とする証拠はない。

GitHubの[本番照合run 37033647817](https://github.com/Atlasez/Admin-Atlesez/actions/runs/37033647817)でも、12回の全試行で期待SHA`c90ad358...`に対し`74084dc...`を観測し失敗している。単一ブラウザの表示や短い反映待ちだけで生じた不一致ではない。

監査PRの証拠は[固定commit a8c54c50のJSON](https://github.com/Atlasez/Admin-Atlesez/blob/a8c54c50e2d790a7284243ffb722fb2fa4f8a3ba/docs/deployments/cloudflare-latest.json)。この記録は2026-10-02 22:43 JSTの[読み取り監査run 37014831005](https://github.com/Atlasez/Admin-Atlesez/actions/runs/37014831005)で更新されている。JSON内の作成時刻はデプロイの時刻であり、監査した時刻ではない。Dashboardで今回確認したのは短縮Version IDと100%配信であり、完全なID・時刻はこの監査記録を根拠とする。

## 3. 経路が変わった時系列

時刻はJST。GitHub変更はcommit時刻を記載し、配信実行はActions・Cloudflareの記録を使う。

| 日時                             | 事実と根拠                                                                                                                                                                                                                                                                        | SHA不一致との関係                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 2026-08-27                       | [運用ナレッジベースの事故記録](https://github.com/Atlasez/Admin-Atlesez/blob/c90ad3584fac538dfd87855ba805751ef1a5b462/docs/ADMIN_KNOWLEDGE_BASE.md)に古い作業コピーのデプロイと別Accountへの公開Workerデプロイが記録されている                                                    | 過去の事故。今回の古い作業コピー・別Account配信を示す証拠として流用しない                |
| 2026-08-29 20:03:59              | [commit b2f52f1](https://github.com/Atlasez/Admin-Atlesez/commit/b2f52f1d41ad12dd80d119287128b8e42a947e99)で`Deploy admin from GitHub`を`push: main`の自動実行へ変更                                                                                                              | Workers Builds未接続でもGitHub Actionsから更新できる経路があった                         |
| 2026-09-27 21:22:16（run開始）   | [run 36318755478](https://github.com/Atlasez/Admin-Atlesez/actions/runs/36318755478)は`event: push`、SHA`bda1ea41a41d0d453f64df79271133baf6ff4db6`で成功。Build・Deploy・本番SHA照合の各stepが成功                                                                                | 当時の自動更新経路の実行証拠                                                             |
| 2026-09-27 21:41:25              | [PR #402 / commit 377e7617](https://github.com/Atlasez/Admin-Atlesez/commit/377e761725905127f8ade2e642c371d614606df5)で`push: main`を削除し、`workflow_dispatch`と`confirm_main`必須条件へ変更                                                                                    | mainへのmergeだけでは自動デプロイされなくなった                                          |
| 2026-09-27 23:52:49（Issue作成） | [Issue #407](https://github.com/Atlasez/Admin-Atlesez/issues/407)はmain`64cb6e7...`、本番`bda1ea41...`、100% Version`11006e23...`を記録                                                                                                                                           | 自動トリガー変更後にmainと配信の差が記録された                                           |
| 2026-09-29 02:21:59              | [PR #448 / commit 341fd181](https://github.com/Atlasez/Admin-Atlesez/commit/341fd181dd72a92791d3be6ba73d9f8a5ba3be48)で`deploy-admin-from-github.yml`を削除し、読み取り専用の`verify-admin-production.yml`を追加                                                                  | 正規経路をWorkers Buildsへ一本化したが、接続は未成立。検査は追加されたが配信は行われない |
| 2026-09-29 19:57:48〜19:57:59    | [事前記録](https://github.com/Atlasez/Admin-Atlesez/issues/407#issuecomment-5888769687)と[完了記録](https://github.com/Atlasez/Admin-Atlesez/issues/407#issuecomment-5888888454)に、cleanなmain checkoutからの例外手動デプロイを記録。SHA`74084dc...`、Version`2f9440ea...`が一致 | 当時はmainと配信が一致。手動デプロイはその後のmergeを自動配信する仕組みにはならない      |
| 2026-09-29 20:59:54（記録）      | [Issueコメント](https://github.com/Atlasez/Admin-Atlesez/issues/407#issuecomment-5889815132)は当初の差分がmacOS専用commitと記録                                                                                                                                                   | 当初のSHA差だけではWeb機能の欠落を断定できない                                           |
| 2026-09-30以降                   | [PR #478後の照合失敗](https://github.com/Atlasez/Admin-Atlesez/issues/407#issuecomment-5911825629)、今回のmain/Worker/画面差分と12回失敗ログ                                                                                                                                      | 現在はWeb/Workerの更新もmainに含まれ、単なるmacOS専用commit差ではない                    |
| 2026-10-02〜10-03                | [PR #491](https://github.com/Atlasez/Admin-Atlesez/pull/491)はWorkers Builds接続のレビュー文書のみ。今回も未接続を確認                                                                                                                                                            | 文書のmergeはCloudflare接続の保存・配信完了を意味しない                                  |

移行の意図は手動・複数経路によるドリフトを防ぐことだったが、**旧経路の停止・廃止が先行し、新経路の接続と初回成功が完了しない状態が続いた**。これが自動更新停止の構造的原因である。誰がCloudflare設定を変更したかを仮定しなくても、GitHub差分と配信記録で説明できる。

## 4. 権限不足と「以前はデプロイできた」の整理

過去のGitHub Actionsは`CLOUDFLARE_DEPLOY_API_TOKEN`を使っていた。現在の監査workflowは`CLOUDFLARE_API_TOKEN`を使う読み取り経路であり、Cloudflare Dashboardの接続操作はログインユーザーの権限とWorkers Builds用token作成を扱う。これらは同じ認証経路ではない。[当時のdeploy workflow](https://github.com/Atlasez/Admin-Atlesez/blob/377e761725905127f8ade2e642c371d614606df5/.github/workflows/deploy-admin-from-github.yml) / [現行監査workflow](https://github.com/Atlasez/Admin-Atlesez/blob/c90ad3584fac538dfd87855ba805751ef1a5b462/.github/workflows/cloudflare-deployment-sync.yml)

Cloudflare公式資料でも、tokenは選択された権限を持ち、Workers Buildsの自動tokenには`Account Settings (read)`等が含まれる。既存Workerのデプロイ権限と、アカウントの管理・接続に必要な権限は区別する必要がある。以前Wranglerで配信できたことだけでは、新しいBuilds接続用tokenを作れることを証明しない。[Workers権限](https://developers.cloudflare.com/workers/authorization/) / [Builds設定](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

接続の`Account Settings Read`不足は[2026-10-02のIssue記録](https://github.com/Atlasez/Admin-Atlesez/issues/407#issuecomment-5953439628)による過去観測である。今回token作成を再実行していないため、同じAPI拒否を新たに再現したとは報告しない。今回直接確認した現在ロールと監査ログの閲覧拒否はその記録と整合する。

未確定なのは、権限不足が以前からあったのか、Cloudflareの権限体系や接続処理の変更で顕在化したのか、実際の権限変更があったのかである。接続時の「内部エラー」という過去の表示を、今回の権限不足と同一の原因だと断定することもできない。これには閲覧可能な監査ログ、接続エラーの応答・request ID、当時のロールとtoken権限の記録が必要となる。現在のrole名だけで権限変更の時期や実行者を逆算しない。

## 5. 関連する監査・身元情報の問題

### 5.1 監査の成功とデプロイの成功が混同されやすい

`Cloudflare deployment sync PR`はCloudflareをGETで読み取り、監査JSONとPRを更新する。`Verify admin production sync`は本番JSONを比較する。どちらも本番を更新しない。したがって「CI成功」「監査workflow成功」「PR merge済み」は本番反映の証拠にならない。

main内の`docs/deployments/cloudflare-latest.json`には8月28日の記録が残っているが、最新観測は未マージのPR #304にある。mainのファイル名`latest`だけで現在の配信を判断すると誤る。PR #304のbranch追従不具合は[PR #489](https://github.com/Atlasez/Admin-Atlesez/pull/489)で修正され、最新の監査runは成功している。この監査PRの修正は、本番デプロイ経路の復旧ではない。

### 5.2 `ref: unknown`や`Source: Unknown`だけで原因を断定できない

[`write-build-info.mjs`](https://github.com/Atlasez/Admin-Atlesez/blob/c90ad3584fac538dfd87855ba805751ef1a5b462/scripts/write-build-info.mjs)はcommitを`CF_COMMIT_SHA`→`CF_PAGES_COMMIT_SHA`→`GITHUB_SHA`→`git rev-parse HEAD`の順で決め、refは環境変数だけから決める。ローカルmainビルドでもref用環境変数がなければ`unknown`になり得る。今回の`unknown`は「main以外から配信された」という証拠ではない。CloudflareのWrangler表示だけでも、ローカル・GitHub Actions・Workers BuildsのどれからWranglerを呼んだかは確定できない。今回の最終配信経路はIssueの実行記録との一致を根拠とする。

別途、公式のWorkers Builds既定変数`WORKERS_CI_COMMIT_SHA` / `WORKERS_CI_BRANCH`をこのスクリプトが参照していない点を確認した。`.git`がなく、この2変数だけを与えた一時ディレクトリで現行スクリプトを実行すると、commit/refとも`unknown`になった。Git checkoutがあればcommitのfallbackは機能するため、この条件付き再現は現在のSHA停滞の原因ではない。接続復旧後の身元情報を確実にする改善候補として記録する。[Cloudflare既定変数の公式仕様](https://developers.cloudflare.com/changelog/post/2025-06-10-default-env-vars/)

## 6. 影響と確定できない事項

旧SHAから調査基準mainまではGit履歴上37 commitある。これは37件の未配信機能という意味ではない。文書、テスト、macOS専用変更も含む。ただし`src/admin-worker.ts`、更新履歴、タスク、通知、編集画面などのWebコードにも差分があるため、現在の不一致を文書・macOSのみの無害な差として扱うことはできない。具体的なユーザー影響は各PRと配信済み機能を照合して判断する。

今回確認したのはmain・配信成果物・Active Version・経路・権限表示であり、全主要画面の受入試験、D1の現在schema、データ破損・流出の有無を検証した調査ではない。データ損失や侵害が発生したとは報告しない。9月29日以降に新しい本番Versionがある、別WorkerにRouteが変わった、あるいはキャッシュだけが旧版を返していることを示す証拠も、取得した記録にはない。

## 7. 原因に対応した復旧・再発防止

1. **権限履歴を追加調査する。** 監査ログを閲覧できるアカウント管理担当またはCloudflareの正規サポート経路で、ロール変更・Git接続変更・token作成/失効・失敗requestを確認する。現在の拒否から「ユーザーが権限を変えた」「Cloudflareが勝手に変えた」と結論しない。
2. **Workers Builds接続をレビュー済み値で成立させる。** [PR #491のレビュー資料](https://github.com/Atlasez/Admin-Atlesez/blob/c90ad3584fac538dfd87855ba805751ef1a5b462/docs/ADMIN_BUILDS_SETTINGS_CHANGE_REVIEW_2026-10-03.md)に従い、固定Account/Worker、正本repository、main、ADMIN用build/deploy command、preview無効・build cache無効を確認する。tokenの権限範囲と接続直後に本番deployが始まり得る影響を確定してから実施する。今回の報告書掲載依頼を接続や権限拡張の承認には使わない。
3. **必要なmigrationと対象main SHAを確定する。** ソース差分・最新のD1状態・バックアップを別途照合し、必要な変更だけをレビュー済み手順で実施する。過去Issueのmigration件数を現状と決めつけない。
4. **初回成功と次の通常mergeの両方を確認する。** 対象SHAのBuild/Deployログ、Worker名、Version ID、100%配信、build-info一致、認証済みChrome主要画面を記録する。mainを継続更新する場合は検査が比較するSHAと実際の配信SHAの時点をそろえる。初回の手動一致だけで自動連携の復旧としない。
5. **配信経路の変更には引継ぎ完了条件を付ける。** 旧トリガーを止める場合、新経路の初回成功まで本番更新が停止することを明示する。停止期間、担当、対象SHA、再開条件を同じIssueで管理し、main merge済みと配信済みを分けて報告する。
6. **身元情報の改善は別PRにする。** Workers Buildsの既定SHA/ref変数への対応、環境変数とcheckoutの不一致検知、監査記録の取得時刻・出典表示を検討する。監視の期待SHAを旧配信SHAに変えたり照合を削除したりして失敗を隠さない。

報告書の変更は文書1ファイルのみ。訂正はこの文書を修正またはrevertするPRで行う。本番Worker・D1・Route・Version・token・権限・cacheへの変更、deploy、rollback、promote、purgeは今回実施していない。本番のSHA不一致とWorkers Builds未接続が解消するまで本番反映の停止条件は継続する。

## 8. 調査と文書変更の検証

- 作業開始時の既存checkoutは`codex/compact-command-search-refinement-20260929`、未コミット変更なし。既存checkoutを変更せず、正本remote `admin/main`の最新SHAから新しいworktreeと`codex/cloudflare-sha-cause-report-20261003`を作成した。既定remote `origin`はバックアップrepositoryのため、GitHub照会はすべて`Atlasez/Admin-Atlesez`を明示した。
- 調査証拠: 正本Git履歴・差分、GitHub Actionsの実行step/失敗ログ、Issue #407の過去配信記録、固定commitの監査JSON、通常/クエリ付き本番JSON、認証済みChromeでCloudflare設定・Deployment・Members・監査ログの読み取り。
- build-infoの条件付き再現は一時ディレクトリ内だけで実行した。既存の本番・ローカル成果物は変更していない。
- `npm ci`、`npm run verify:deploy-config`、`npm run check`（292 files、0 errors / 0 warnings、既存9 hints）、`npm run lint`、`npm test`（48 files / 368 tests）、ADMIN設定の`npm run build`、`npm run verify:build-info`が成功。
- 文書のformat確認・`git diff --check`とPRのCI結果はPR本文で記録する。E2E対象の実装変更はなく、本番への配信・主要画面の受入を成功扱いしていない。
