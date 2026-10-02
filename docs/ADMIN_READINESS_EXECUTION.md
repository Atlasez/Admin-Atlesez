# 実運用開始 P0 実行記録

開始: 2026-10-02 JST。ユーザーが監査項目1〜8の実行とGoalによる継続管理を依頼。
ユーザーの継続指示により作業を再開。Goalに保存した目標を継続参照する。番号の定義とP1/P2の改善案は[監査](ADMIN_READINESS_AUDIT_2026-10-02.md)を参照。

## 完了判定

コード実装、ローカル検証、PR/CI、main反映、本番受入は別々に記録する。本番受入の証拠がない項目に完了チェックを付けない。秘密値・Cookie・非公開会員情報・SQL exportをコミットしない。

| 項目                           | 状態            | 残作業/依存条件                                                                                                                                     | 完了証拠 |
| ------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1 Workers Builds復旧・本番反映 | 停止: SHA不一致 | PR #486はmainへ統合・CI成功。本番build-infoは74084dc…のまま。merge後の照合workflowは12回の照合後に不一致で失敗。Builds設定・token作成は未実施       | 未完了   |
| 2 応募フォーム修正             | main反映済み    | PR #486の応募欄/payload修正がmainに反映済み。main CI成功。本番Workerは旧SHAのため、配信後の実画面確認が必要                                         | 未完了   |
| 3 公開個人情報説明             | PRレビュー待ち  | 公開側正本Atlasez/Atlasez01にprivacy説明・応募導線を実装。公開手順書のWorkers/main/SHA記載もPR #140で修正。CIは最新commit再実行中、人間レビュー必要 | 未完了   |
| 4 権限別受入                   | 検証準備        | 全migrationの隔離D1で実APIの全体/担当/分野統括/別プロジェクト/退会後を確認。本番のUI/API受入は未完了                                                | 未完了   |
| 5 新規参加者受入               | 検証準備        | 仮セッションで基本情報保存・応募・二重応募防止・他人の情報非公開を確認。実Googleログインと審査・受入は未完了                                        | 未完了   |
| 6 メール/Discord実連携         | 検証準備        | 隔離D1のメールqueueと模擬providerで503後retry・同一idempotency key・送信済再送防止を確認。実到達/Discord実アカウントは未完了                        | 未完了   |
| 7 記事公開実証                 | 検証準備        | 公開先Atlasez/Atlasez01と受入・訂正・非公開化の試験手順を記録。実公開は未実施                                                                       | 未完了   |
| 8 バックアップ/復旧運用        | 作業中          | 既存export75テーブルの隔離復元・FK0を独立確認。保管・担当・30世代・RPO24h/RTO4hを案として記録。代理担当/暗号化保管/定期実行は未確定                 | 未完了   |

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
- Recovery PR [#487](https://github.com/Atlasez/Admin-Atlesez/pull/487)では、現在のtoken作成UI上はWorker単体scope不可である事実を反映。古典的な最小candidateもAccount内の全Worker Scripts Edit + zone `atlasez.org` Routes Editに及び、ADMIN以外へ影響できるため、Worker単体scopeが必須ならAccount owner対応へ回す。D1 EditやAccount Settings Readを足さない。手動tokenのBuilds picker表示・Build成功は未検証。
- 公開PR [#140](https://github.com/Atlasez/Atlasez01/pull/140) は人間レビュー待ち。公開手順書の古いPages記載をWorkers/main/SHA/100%/Chrome確認へ修正し、Workers Builds接続時の条件付き表現を追加。PR head `045bef77` にpush後のCI実行状態を確認する。
- バックアップ復元の現証拠は旧exportの隔離検証（75 tables / integrity ok / FK 0）に限られる。最新DB復元、保管先、担当、保持、通知、RPO/RTOは未確定。項目4〜7の隔離試験はdocs記載、実サービス受入は未完了。

- ユーザーのリミットによる停止依頼で作業を中断。再開情報を `ADMIN_READINESS_RESUME.md` と監査出力ディレクトリの `RESUME.md` に保存。その時点では全E2Eの終了結果が未確認。PR作成前、Cloudflare変更なし。

- 再開時、前回全E2Eの最終集計を確認: 323 passed / 14 skipped。新規応募10件を含む。途中停止扱いを訂正。最終check/lint/unit/format成功、unit47ファイル364件成功。公開privacyの最終check/build成功。ChromeでPC/390px表示を確認し、横はみ出しなし。
