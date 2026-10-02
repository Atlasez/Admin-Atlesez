# 実運用開始 P0 実行記録

開始: 2026-10-02 JST。ユーザーが監査項目1〜8の実行とGoalによる継続管理を依頼。
ユーザーの継続指示により作業を再開。Goalに保存した目標を継続参照する。番号の定義とP1/P2の改善案は[監査](ADMIN_READINESS_AUDIT_2026-10-02.md)を参照。

## 完了判定

コード実装、ローカル検証、PR/CI、main反映、本番受入は別々に記録する。本番受入の証拠がない項目に完了チェックを付けない。秘密値・Cookie・非公開会員情報・SQL exportをコミットしない。

| 項目                           | 状態             | 残作業/依存条件                                                                                                                                                          | 完了証拠 |
| ------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1 Workers Builds復旧・本番反映 | 停止: SHA不一致  | PR #486はmainへ統合・CI成功。本番build-infoは74084dc…のまま。merge後の照合workflowは12回の照合後に不一致で失敗。Builds設定・token作成は未実施                            | 未完了   |
| 2 応募フォーム修正             | main反映済み     | PR #486の応募欄/payload修正がmainに反映済み。main CI成功。本番Workerは旧SHAのため、配信後の実画面確認が必要                                                              | 未完了   |
| 3 公開個人情報説明             | PRレビュー待ち   | 公開側正本Atlasez/Atlasez01にprivacy説明・応募導線を実装。公開手順書のWorkers/main/SHA記載もPR #140で修正。CIは最新commit再実行中、人間レビュー必要                      | 未完了   |
| 4 権限別受入                   | 検証準備         | 全migrationの隔離D1で実APIの全体/担当/分野統括/別プロジェクト/退会後を確認。本番のUI/API受入は未完了                                                                     | 未完了   |
| 5 新規参加者受入               | 検証準備         | 隔離D1の実Worker APIで受入から初回利用まで、不承認後の応募者画面/API拒否まで確認。実Googleログイン・人間の審査と受入/見送り連絡は未完了                                  | 未完了   |
| 6 メール/Discord実連携         | 検証準備         | 隔離D1のメールqueueと模擬providerで503後retry・同一idempotency key・送信済再送防止を確認。実到達/Discord実アカウントは未完了                                             | 未完了   |
| 7 記事公開実証                 | 検証準備         | 公開先Atlasez/Atlasez01と受入・訂正・非公開化の試験手順を記録。実公開は未実施                                                                                            | 未完了   |
| 8 バックアップ/復旧運用        | 提案レビュー待ち | 既存exportの隔離SQLite検証は75 tables / integrity ok / FK 0。migration 0120〜0123適用前。定期化前にExport APIの停止影響を測定し、保管先/保持/通知/担当/RPO/RTOを承認する | 未完了   |

## 作業開始時

- 元の作業ツリー: clean。古い作業branchを保持し変更なし。
- 起点main: 743ab214fe525e0aea0809b8ab36218156e93c34。
- 分離worktree、branch codex/admin-operational-readiness-p0-20261002。
- main CI成功。本番は監査時に74084dc6147490fef228b6a1f68ae3fedae79ba7。
- D1 0120〜0123とバックアップの検証成功はIssue #407の既存記録。今回の独立確認とは区別する。

## 実行ログ

- Goal登録。監査30項目をリポジトリへ永続保存。
- 検証用Google/メール/Discord識別子と、Cloudflare必要権限のある担当者をユーザーへ照会。回答を待つ間、依存しない実装・隔離検証を進める。

## 2026-10-02の追加証拠

- ユーザーは仮利用者での検証と、現在の権限内でのCloudflare復旧案検討を希望。認証方式や本番データを変更せず隔離試験を実施。
- 応募設問E2E: 10件成功。実SQL/APIの受入試験: 2件成功。メール模擬試験は実到達と区別。
- [受入手順](ADMIN_READINESS_ACCEPTANCE.md)、[token復旧追加案](ADMIN_BUILDS_TOKEN_RECOVERY_2026-10-02.md)、[復元・運用案](ADMIN_D1_RECOVERY.md)を保存。
- 公開Worker atlasez01のGit接続はAtlasez/Atlasez01・main、deploy command npm run deploy:production、cache無効。API token欄は「設定されたAPIトークンが利用できません」。UI表示の確認であり、今回のBuild実行成功/失敗の判定ではない。Cloudflareの設定保存は実施なし。
- 本番P0 1〜8は未完了。次はPR/CI、公開側人間レビュー、token案レビューと作成直前承認、main経由の配信確認、実サービスの受入へ進む。

## 2026-10-02 PR #486 merge後の証拠

- `main` merge commit: `cabd861396c4c6af6208cf4357462876289d32df`。main CI run [37000450407](https://github.com/Atlasez/Admin-Atlesez/actions/runs/37000450407) success。
- Merge後read-only production check [37000450389](https://github.com/Atlasez/Admin-Atlesez/actions/runs/37000450389) failure。12回照合しても、expected main `cabd861396c4c6af6208cf4357462876289d32df` / public build-info `74084dc6147490fef228b6a1f68ae3fedae79ba7`。
- Issue [#407](https://github.com/Atlasez/Admin-Atlesez/issues/407) に同期失敗とDashboard再確認を記録。Worker設定、token、route、D1、Versionは変更していない。
- 固定Account `812021e62fa20465950b61be55dfe064` と `atlasez-admin` をDashboardで再確認。Gitは未接続。Connectフォームの自動token作成は既存の`Account Settings Read`拒否が解消しないと失敗する。フォーム上の既存API token候補も無く、「新しいトークンを作成する」のみ。
- Connectフォームの現在のデフォルトはbuild `npm run build` / deploy `npx wrangler deploy` / preview有効で、運用文書と不一致。root `/` とcache無効は正しい。フォーム送信や変更保存は未実施。
- Recovery PR [#487](https://github.com/Atlasez/Admin-Atlesez/pull/487)ではProfile user-token UIにWorker単体scopeが出ず、Workers Buildsはaccount-owned token未対応という公式資料の組合せを記録。Account-wide classic tokenはADMIN以外へ影響できるため不採用。Cloudflare owner/Supportに個別Worker-scoped tokenをBuildsが受け付けるか照会が必要。D1 EditやAccount Settings Readを足さない。
- 公開PR [#140](https://github.com/Atlasez/Atlasez01/pull/140) は人間レビュー待ち。公開手順書の古いPages記載をWorkers/main/SHA/100%/Chrome確認へ修正し、Workers Builds接続時の条件付き表現を追加。PR head `045bef77` にpush後のCI実行状態を確認する。
- バックアップ復元の現証拠は旧exportの隔離検証（75 tables / integrity ok / FK 0）に限られる。最新DB復元、保管先、担当、保持、通知、RPO/RTOは未確定。項目4〜7の隔離試験はdocs記載、実サービス受入は未完了。

## 2026-10-02 バックアップ運用の独立監査

- `docs/ADMIN_D1_RECOVERY.md`記録の手動exportを確認。10,872,416 bytes、SHA256 `71d00dd248479d2088d253486e704e536b9b48d755fbca1d44cd400b797f1ed8`、75 tables、隔離SQLiteの`integrity=ok`、FK違反0件。これはmigration 0120〜0123適用前で、最新本番状態ではない。
- RepositoryにD1 bindingはあるがR2 bucket / Workflowによる定期backup設定はない。オフサイト保存先、暗号化、保持/削除、監視、失敗通知、owner/代理、復旧演習は未構成。
- 公式の[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)は現在の契約により7日または30日の復元範囲がある。restoreはDBを上書きするため、通常backupと同一視しない。
- 公式[D1 Export API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/)は、大規模export中にD1 queryを処理できなくなる場合があり、export中は継続pollが必要。現在の約10.9 MBでの影響時間は未測定。daily scheduleを設定する前に非本番で測定し、本番を使う検証は低トラフィック時間帯・承認済み手順・中断条件を決めてから行う。
- 具体案と未解決の承認事項は[`ADMIN_BACKUP_OPERATIONS_PROPOSAL_2026-10-02.md`](ADMIN_BACKUP_OPERATIONS_PROPOSAL_2026-10-02.md)。PR #487は文書提案のみで、Cloudflare設定や保存先に変更を加えていない。

- ユーザーのリミットによる停止依頼で作業を中断。再開情報を `ADMIN_READINESS_RESUME.md` と監査出力ディレクトリの `RESUME.md` に保存。その時点では全E2Eの終了結果が未確認。PR作成前、Cloudflare変更なし。

- 再開時、前回全E2Eの最終集計を確認: 323 passed / 14 skipped。新規応募10件を含む。途中停止扱いを訂正。最終check/lint/unit/format成功、unit47ファイル364件成功。公開privacyの最終check/build成功。ChromeでPC/390px表示を確認し、横はみ出しなし。

## 2026-10-03 不承認受入経路の補強

- `tests/unit/admin-readiness-integration.test.ts` に、仮応募者の応募→確認中→見送りの実Worker Workflow API試験を追加。応募者本人の状態/応募状況APIに不承認結果が残ること、オンボーディングAPIが403、会員カレンダーが認証後の非会員導線へ302、project membershipが作成されないこと、監査イベント2件と外部キー整合性を確認。
- 受入経路の試験と合わせ、承認・初回オンボーディングと不承認の両分岐を隔離SQLiteで検証可能にした。Google OAuth、実通知到達、人間による審査・見送り連絡は未実証なのでP0.5は未完了。
- 検証: `npm run verify:deploy-config`、`npm run check`（292 files、error/warningなし）、`npm run lint`、`npm test`（48 files / 369 tests pass）、`npm run format:check`、ADMIN向け`npm run build`、`npm run verify:build-info`（SHA `5dc065ebaf5e0cffff84c9ecf6e457299db24cea`）、`git diff --check` がすべて成功。ビルド時の既存Pagefind警告（3ページに`<html>`要素なし）は今回の変更範囲外。
