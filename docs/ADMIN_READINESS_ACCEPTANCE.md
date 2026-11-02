# 実運用開始の受入試験

対象は監査P0の4〜7。仮利用者は `@atlasez.test`、隔離D1はメモリ内SQLiteで全migrationを適用する。本番の認証方式・権限表・Google認証を検証用に変更しない。プロバイダーを模擬した試験と実到達・本番受入を区別する。

## 自動検証

- `tests/unit/admin-readiness-integration.test.ts`: 実Workerのルーターと実SQLで新規利用者、基本情報保存、応募、二重応募防止、他人の基本情報非公開、全体管理と担当者の境界、別プロジェクトの応募非公開、退会後の管理権限剥奪を確認する。外部通信は拒否する。
- 同試験は、仮応募者の基本情報保存から応募・審査中・受入・応募状況・初回プロフィール保存までを一連で確認する。審査状態は実WorkerのWorkflow APIで遷移し、監査イベントとproject membershipが保存されること、受入前は会員画面に入れず、公開プロフィールとプロジェクト内プロフィールの保存後に会員画面へ進めることも検証する。見送り経路でも応募状況を本人が確認でき、応募者ステージを保ち、オンボーディング/API・会員画面を拒否し、project membershipを作らないことを確認する。全migration適用済みの隔離SQLiteを使い、実OAuth・メール・Discord連携は証明しない。
- `tests/e2e/applicant-discord.spec.ts`: 見送り後に応募状況画面が「今回は見送り」と結果を表示し、連絡待ち文言とDiscord連携案内を出さないことを仮API応答で確認する。
- 同試験のメール送信は、仮受信先限定のプロバイダーを使う。503後の再試行、同じidempotency key、送信済みの再送防止を確認する。メールボックスへの実到達は証明しない。
- `tests/e2e/application-project-fields.spec.ts`: 5プロジェクト×1280px/390pxで設問の表示・必須・無効化・送信内容・画面幅を確認する。UIのAPI応答は仮データ。
- 既存の `admin-workflow-atomicity.test.ts`、`admin-worker-discord-roles.test.ts`、`onboarding.spec.ts`、`applicant-discord.spec.ts`、応募管理のE2Eを継続実行する。これらは外部サービスの実証を代替しない。

受け入れ担当の【仮】は[受け入れ手順](ADMIN_MEMBER_INTAKE.md)にある。主担当は運営事務局、代理は当該プロジェクトのプロジェクト責任者、連絡は https://atlasez.org/contact/ 。確定前の仮の値であり、下の本番受入を実施済みにはしない。

## 本番受入の記録欄

以下はADMINのWorkers Builds復旧後、対象main SHAの成功run、固定Worker `atlasez-admin` のVersion 100%配信、公開`build-info.json`の一致を確認してから実行する。日付、PR/main SHA、Worker Version、操作者のrole、結果を記録し、秘密値・個人情報・OAuth stateを記録しない。最新の復旧状態は[実運用準備監査](ADMIN_OPERATIONAL_READINESS_2026-10-12.md)と[Issue #509](https://github.com/Atlasez/Admin-Atlesez/issues/509)を実行直前に照合する。

| 項目                 | 手順                                                                                                                                                                                                 | 合格条件                                                                                                                                                                                                                                                                                  | 実績                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 4 権限               | 応募者・会員・担当・分野統括・全体管理・別プロジェクト・退会者で主要画面と直接APIへアクセス                                                                                                          | 担当外の応募・本文・会員情報を取得できない。退会後に管理操作できない                                                                                                                                                                                                                      | 未実施                             |
| 4 権限失効           | 専用隔離アカウントで担当roleを失効させ、Chromeに既存sessionを残したままナビ、直接URL、既知の合成データAPIを再読込。別scopeも確認する                                                                 | 失効したscopeはAPI・直接URLとも拒否され、前画面のキャッシュや開きっぱなしのタブから保護データを再取得できない。他の有効scopeは維持される                                                                                                                                                  | 未実施（専用環境待ち）             |
| 4 休止・再開         | 隔離会員を休止→休止中の画面/API→再開し、profile・membership・task・calendarと監査履歴を照合。DiscordはOPS-18で決めたrole方針と別に記録                                                               | 休止中は合意した範囲だけが失効し、再開後は元の許可scopeだけ復旧。休止/退会に伴うDiscord role扱いは運営決定前に本番変更しない                                                                                                                                                              | 未実施（専用環境・方針待ち）       |
| 4 退会・申請取り下げ | 専用隔離会員で退会申請をpending→reviewing/scheduledの状態ごとに本人が取り下げ、別ケースで審査・予約日適用まで実行。適用前後に既存sessionを残し、ナビ・直接URL・既知の合成APIを再読込。再開申請も確認 | pending/reviewing/scheduledの取り下げはcancelledとなりmembership/lifecycleを変更しない。applied後の取り下げは拒否。適用後は退会状態が画面・API・監査に一致し、失効scopeを既存session/直接URL/APIから再取得できず、再開後は合意済みscopeだけ戻る。通知/Discordは重複せず、外部同期は別受入 | 未実施（専用環境・運営方針待ち）   |
| 4 Discord連携解除    | active Discord role割当がある合成会員で連携解除→role割当を解除・同期成功後に連携解除                                                                                                                 | active割当が残る間は409で連携行/割当が保たれ、role解除・同期成功後だけ連携解除できる。外部Discord APIの実同期結果は承認済みsandboxで別途確認                                                                                                                                              | 未実施（PR #526反映・sandbox待ち） |
| 5 新規参加           | 専用Googleアカウントで基本情報保存→各応募→受付→面談・審査→受入/見送り→初回プロフィール・任意のチュートリアル                                                                                         | 各段階の画面と保存状態が一致。二重応募を防止。受入前に会員操作不可                                                                                                                                                                                                                        | 未実施（OAuth開始のみ確認）        |
| 6 メール             | 指定した検証受信先で受付・面談・受入通知を受け取る                                                                                                                                                   | 実メールの到着、宛先、リンク、迷惑メール状況を確認。ログのsentだけで合格にしない                                                                                                                                                                                                          | 未実施                             |
| 6 Discord            | 専用利用者を連携し、受入ロールと担当分野を確認。隔離試験で失敗・再試行も確認                                                                                                                         | 応募の個人情報をDiscordへ転送しない。管理者ロールを誤付与しない。再試行で重複しない                                                                                                                                                                                                       | 未実施                             |
| 7 記事公開           | 公開してよい原稿を下書き→査読→分野統括/プロジェクト統括承認→公開Run→CI→公開用GitHub App処理→公開側main・Workers Builds                                                                               | 内容の人による承認とGitHub自動レビューを混同しない。CI失敗/needs-operatorでmergeしない。対象SHA、公開URL、build-info、Versionを照合                                                                                                                                                       | 未実施                             |
| 7 訂正               | 更新案を作り、承認・PR・CI・本番反映まで確認                                                                                                                                                         | 公開中の本文が承認前に変わらず、承認済み版に更新される                                                                                                                                                                                                                                    | 未実施                             |
| 7 非公開化           | 対象記事・理由・参照関係をレビューし、非公開PRとCI、本番反映を確認                                                                                                                                   | URL・一覧・検索の除外が一致。履歴・復旧方法を残す                                                                                                                                                                                                                                         | 未実施                             |
| 8 バックアップ       | 最新D1復旧点と保存先を確認し、許可済み隔離環境へ復元。応募/profile、membership/permission、task/calendar、article/revision/audit、queue/checkpointの関連を検査                                       | 暗号化/閲覧者/保持/削除/失敗通知が決定済み。integrity・FK・関連・Worker/schema互換性がpassし、RPO/RTOを実測。実データの外部移送・本番restoreは別承認                                                                                                                                      | 未実施                             |
| 8 個人データ保持     | 未完了profile、accepted/rejected応募、記事報告hash/contact、本文/運営メモ、backupコピーの目的・起算日・期限・例外を決定。隔離D1で期限前/境界/期限後/再実行を確認                                     | 運営/privacy責任者が期間を記録承認し、公開説明と一致。承認前は`ADMIN_PERSONAL_DATA_RETENTION_ENABLED`を未設定にし記事報告hash/contactの追加消去を無効に保つ。既存session/rate limit/採否確定済み応募の整理は継続。実D1削除は別途受入                                                      | 未実施                             |
| 8 Cron・queue        | 各scheduleの直近success/failure、処理時間、最古滞留、失敗回数、再試行枯渇、メール/Discord/GitHubの結果を確認                                                                                         | 設定の存在だけを正常扱いしない。重複防止・再試行・alert通知先の受信を承認済みsandboxで確認                                                                                                                                                                                                | 未実施                             |
| 9 UI/UX              | 専用roleで主要操作を390px/desktop/200%拡大、keyboard・screen readerで実行。loading/empty/success/403、入力error、通信切断、保存競合も確認                                                            | 横overflowなし、focus/エラー案内が識別可能、失敗後に誤った成功表示や二重送信がなく、操作後の次の行動が分かる。画面幅/role/手順/結果を記録                                                                                                                                                 | 未実施                             |
| 10 運営引継ぎ        | 主担当・代理・窓口・応募返信目安・queue確認頻度・相談/緊急連絡先を登録し、不在時の引継ぎを机上演習                                                                                                   | 未対応項目ごとに責任role、次回期限、完了条件、エスカレーション先が決まり、代理が手順だけで引き継げる                                                                                                                                                                                      | 未実施                             |

テスト用Google/Discordアカウントは実サービス上に存在する必要がある。文字列だけの仮アカウントは隔離試験に使えるが、OAuth・メール実到達・Discordの実権限を証明できない。既存の認証済みChromeを使う場合も承認済みの専用検証アカウントに限る。個人アカウント候補が表示されたら選択せず停止し、識別子やOAuth stateを記録しない。

2026-10-12 公開ADMINログイン導線の読み取り確認: 未認証でADMINトップを開くとGoogle OAuthへ遷移し、Googleのアカウント選択画面まで到達した。アカウント識別子やOAuth stateは記録せず、アカウント選択・同意・callback・セッション確立には進んでいない。専用検証アカウントを確認できないため停止した。これはOAuth開始導線だけの確認であり、本人確認・権限・応募の受入証拠ではない。

## 記事公開が停止した場合

公開側正本は `Atlasez/Atlasez01`、公開Workerは `atlasez01`、URLは `https://atlasez.org`。ADMIN側と公開側のSHAを混同しない。公開PRがCI失敗・レビュー未完了・main未反映、公開WorkerがBuilds未接続、または本文・SHA不一致なら、公開済みへの強制変更を行わず、そのrunを調査する。推測のmerge、Version promote、cache purge、直接deployは行わない。

## 2026-11-03 最新確認（過去スナップショットを更新）

この記録は2026-11-03 JSTにGitHub、公開build-info、read-only Worker情報と隔離統合worktreeを確認した結果である。ローカル/CI成功をstaging・本番受入の証拠にしない。秘密値、実会員情報、OAuth stateは記録しない。

### 対象SHA・自動検証

- 現在のADMIN `main`: `5e8dd7533e417b9237c232102856bfecd026e2c0`。
- PR [#545](https://github.com/Atlasez/Admin-Atlesez/pull/545): HEAD `eba29378eada1cdf202ee0384d1e1f0039bd70fa`、exact-head `verify` run [41510323361](https://github.com/Atlasez/Admin-Atlesez/actions/runs/41510323361) success。`0134` migration、応募後のread/response喪失の状態区別、partial batch commitの検出・idempotent補完・運営向け再照合、PIIを含めない相関ログを含む。
- PR [#546](https://github.com/Atlasez/Admin-Atlesez/pull/546): HEAD `e08d07b6177ec72309c5272505b5464f3942659b`、exact-head `verify` run [41480187492](https://github.com/Atlasez/Admin-Atlesez/actions/runs/41480187492) success。Wrangler 4.156.2とlockfile更新。
- PR [#547](https://github.com/Atlasez/Admin-Atlesez/pull/547): HEAD `3281a7b05f7b566cc2acc0ace62277428b9deef2`。限定受入ゲートを含むstaging checklist/runbookを追加。exact-head run [41515735513](https://github.com/Atlasez/Admin-Atlesez/actions/runs/41515735513) はこの記録時点で進行中。旧HEADの成功は新HEADの証拠にしない。
- #545→#546の順に適用した隔離統合worktree commit `6b85e4afb15eebf44ec467d3a7d72cbf47b98bdc`で `npm ci`、deploy-config、deploy-cli、check、lint、unit、format、ADMIN build、build-info、Wrangler dry-run、Playwright/axeを確認。unitは73 files / 596 tests pass。E2E/axeは414件中401 passed / 14 skipped / 0 failed。2 workersと5 workersの試験を行った。5-worker試験の初回catalog一覧失敗は初期catalog ready前のdispatch競合で、ready待ちを加えた後に通過。既存editorの30秒timeoutは増やしていない。live OAuth/provider/production smokeは行っていない。
- `verify:deploy-config`、TypeScript `check`、lint、unit、format、ADMIN build、`verify:build-info`、Wrangler dry-runは隔離統合worktreeでpass。共有build成果物をE2Eと並行生成していない。これらはPR exact-head CIまたは隔離検証の結果であって、main統合後のCIを代替しない。

### 応募状態・D1

| 項目                       | 状態                 | 証拠と制限                                                                                                                                                                                                    |
| -------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 通常応募・同時送信         | PASS（隔離）         | Worker routerと実SQLiteで応募行、運営対応task、メールqueueのtransaction件数を照合。同時/重複送信は一応募へ収束。201は全件作成とcommit後readが一致するときだけ返る。                                           |
| 応答喪失・保存状態read失敗 | PASS（隔離）         | `applicationSaved:false`の互換フィールドと`applicationState:unknown`を区別。409再送時は応募者本人の状態確認へ誘導し、誤った失敗表示を避ける。                                                                 |
| batch後の部分commit        | PASS（隔離）         | SQLite `RAISE(IGNORE)`で応募行のみが残る状態を作り、検出、pending marker、idempotent task/queue補完を確認。sent済みメールは再送しない。通常の再応募409だけに依存せず照合/Cronと限定管理者の再実行経路を用意。 |
| PII・相関ログ              | PASS（自動検査範囲） | attempt相関IDとエラー分類のみ。応募本文、email、OAuth secretをログへ記録しないテストを含む。                                                                                                                  |
| migration 0134             | PASS（localのみ）    | 新規隔離SQLiteへ全migrationを順番に適用。#545は0134を追加するため「schema変更なし」ではない。共有/本番D1への適用・書込みはしていない。                                                                        |
| 本番D1 migration status    | BLOCKED              | 固定ADMIN D1への最新read-only migration status照会はCloudflare API 7403 (`unauthorized`)。過去の一覧には0134 pendingの記録があるが、現状値として扱わない。                                                    |
| backup/restore             | NOT TESTED（本番）   | 本番export/restoreは行っておらず、実測RPO/RTO、暗号化copy、保持・復元手順は未承認/未実証。                                                                                                                    |

### 本番配信・provenance

- 公開 `https://admin.atlasez.org/build-info.json` はrepository `Atlasez/Admin-Atlesez`、ref `main`、commit `5e8dd7533e417b9237c232102856bfecd026e2c0`、builtAt `2026-10-14T07:54:26.721Z`を報告。
- read-onlyで取得した固定Worker `atlasez-admin` の最新DeploymentはVersion `ea236de8-3458-421c-a9ba-4030a9d86674`、100%配信、`2026-10-14T07:55:28.329877Z`、source `wrangler` / deployment annotation。Workers Builds runのcheckout SHAとこのVersionの対応は確認できない。
- production sync run [41420726517](https://github.com/Atlasez/Admin-Atlesez/actions/runs/41420726517) successはbuild-info/main照合のみ。Version provenance、認証済みChromeの主要画面受入、最新Cloudflare Builds設定を証明しない。
- Issue [#509](https://github.com/Atlasez/Admin-Atlesez/issues/509)の最終更新記録は2026-10-13。コメントには10/11にProduction `main`・Preview OFF・Build cache OFFのWorkers Builds設定が保存された記録と、Deploy段階でWorkers Routes permissionによりBuildが失敗した記録がある。従って「未接続」と断定しない。一方、現在のDashboard設定はread-onlyで取得できておらず、現在接続/自動deploy状態はUNKNOWN。現在の100% Worker VersionとBuild runのprovenanceも未照合。
- 2026-11-03の最新Cloudflare API read-only D1照会はcode 7403で失敗。Workers Builds UIの現在値も読み出せていない。Cloudflare設定・Worker・D1の変更はしていない。
- Branch protectionはrequired check `verify`、strict=true、required approving reviews=0、admin enforcement=true。値は変更していない。

### staging / 外部サービス / 運営決定

PR #547の `docs/ADMIN_MEMBER_INTAKE_STAGING_CHECKLIST.md` は専用Cloudflare Worker/D1、Google OAuth client/callback、合成Google account、Resend test sink、Discord test guildの設定要件、STG-01〜09の実施手順・期待結果・PIIなし証拠形式、API/role matrix、停止条件を記録する。環境・credential・実アカウントはまだ用意されていないため各項目はBLOCKED。STG-08 Discord grant/revokeは本人consentとOPSD-08承認後のみ行う。

- 実Google OAuth login/callback/state/Cookie/CSRF: NOT TESTED（専用client/account待ち）。
- Resend実sink到達・providerイベント・再送/timeout: NOT TESTED（test sink/credential待ち）。queue作成と配達を混同しない。
- Discord test guild grant/revoke/read-back・timeout後状態: NOT TESTED（test guild/botとOPSD-08判断待ち）。
- UIと直接APIの全role matrix、旧sessionでの休止/退会・復帰、認証済みChrome、実機/スクリーンリーダー: NOT TESTED（専用staging/合成role account待ち）。隔離テストは限定scopeのみpass。
- OPSD-01〜09はすべて未承認。候補・推奨案は決定ではない。担当と完了証拠は [運営決定チェックリスト](ADMIN_MEMBER_INTAKE_STAGING_CHECKLIST.md) と [決定票](ADMIN_OPERATIONAL_DECISIONS.md) に記入する。

| ID      | 決定事項                                                | 責任roleと必要な完了証拠                                                    |
| ------- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| OPSD-01 | queue別主担当/代理、連絡先、返信目安                    | 運営責任者。記名担当表と代理者の引継ぎ記録。                                |
| OPSD-02 | 限定人数/project/期間、未対応上限、受付停止・再開基準   | 運営代表・各project lead。数値入り募集計画と停止時案内。                    |
| OPSD-03 | 応募/profile/運営メモ/backupの目的・保持・削除窓口      | Privacy責任者・運営責任者。承認済み保持/削除表と公開文。180日候補は未承認。 |
| OPSD-04 | 監査ログのPII、閲覧scope、用途・保管/削除               | Privacy責任者・ADMIN管理者。log schema/閲覧権限と公開説明の対応表。         |
| OPSD-05 | backupの暗号化copy、閲覧/保持/削除、実測RPO/RTO         | D1運用担当・Security。隔離restore証拠、時間、手順、権限記録。               |
| OPSD-06 | provider/Cron queueの監視頻度、滞留閾値、alert先        | 運営責任者・provider担当。失敗注入から通知受信・引継ぎまでの記録。          |
| OPSD-07 | 本番停止権限、停止順、連絡先、復旧承認者                | 運営責任者・Cloudflare管理者・D1運用担当。署名済み停止/再開手順と机上演習。 |
| OPSD-08 | 休止/project離脱/退会時のDiscord role保持/削除、復帰    | 運営責任者・Discord管理者。状態別方針、本人案内、test guild受入。           |
| OPSD-09 | staging/Chrome role別受入の環境、account owner、cleanup | Security・staging owner。隔離環境台帳、合成account一覧、cleanup証拠。       |

### GitHub整理・依存順

| PR   | 最新状態                                                                                         | 評価                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| #545 | OPEN, HEAD `eba29378eada1cdf202ee0384d1e1f0039bd70fa`, exact `verify` success                    | #546統合後にbase追従・CI再実行。0134の本番適用/確認が先行条件。                                                      |
| #546 | OPEN, HEAD `e08d07b6177ec72309c5272505b5464f3942659b`, exact `verify` success                    | 独立した依存/Wrangler更新。main mergeはWorkers Builds自動deploy可否の確認後のみ。                                    |
| #547 | OPEN, HEAD `3281a7b05f7b566cc2acc0ace62277428b9deef2`, run `41515735513` in progress at snapshot | 運営受入checklist/runbook。docs-onlyでもmain mergeでbuild/deployが動くなら同じrelease gate。                         |
| #536 | OPEN, base stale, exact prior `verify` success                                                   | ログイン/error/404 UIの別目的。現mainへrebase後、auth/API互換性とexact CIを再確認。                                  |
| #528 | OPEN, CONFLICTING                                                                                | portal unread summaryは現mainに同等以上の実装あり。obsolete/重複候補、再実装しない。                                 |
| #527 | OPEN Draft, CONFLICTING                                                                          | backup scan変更は独立。rebase後のcheckpoint互換性・隔離検証が必要。                                                  |
| #517 | OPEN, stale base                                                                                 | Workers Builds outage説明が古い。Issue #509の最新状況と照合してから扱う。                                            |
| #505 | OPEN, docs-only deployment sync, no check run                                                    | main SHA/build-infoは一致するがprovenance証拠ではない。branch protection required checkなしのためmerge-readyでない。 |

#545/#546/#547のPR本文とexact-head CIを再確認した。依存順は、まず#546→新main上で#545と#547をrebase→exact-head CI→0134の本番適用/検証を別の承認済みreleaseで実施してから#545のmerge判断とする。ただし現在はWorkers Buildsの自動deploy状態がUNKNOWNで、main mergeによる本番変更を排除できないため、どのPRもmergeしない。#546が先に統合された場合も#545/#547の旧CIを流用せず、新base上で全required checkを再実行する。D1の変更/merge/deploy許可は別途必要。

### 受入判定

| Gate                  | 判定    | 根拠                                                                                                                                                       |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code Ready            | BLOCKED | #545/#546の自動検証と統合隔離試験はpass。ただしPR未統合、role/API matrixとlifecycle session失効の全網羅がなく、0134も本番未確認。                          |
| Staging Ready         | BLOCKED | 専用Worker/D1/OAuth/Resend/Discord環境・合成accountが未準備。チェックリストは実行前手順であって受入結果ではない。                                          |
| Production Verified   | BLOCKED | build-info SHAはmainと一致するが、Worker VersionとWorkers Builds runのprovenance、最新Build設定、認証済みChrome受入が欠落。D1 migration statusも取得不可。 |
| Limited Intake GO     | NO-GO   | 0134、production provenance、staging OAuth/provider/role tests、OPSD-01/02/03/05/06/07/08/09の決定・証跡が未完了。                                         |
| Public Recruitment GO | NO-GO   | 限定受入実績、受付容量/停止基準、privacy公開文、backup/incident/provider受入、公開側PR #140の判断が未完了。                                                |

### 次の作業と責任者

1. Cloudflare/release ownerはDashboardでWorkers Builds接続・Production branch・Preview・commandsをread-only記録し、main mergeがproduction deployを起動するか判定する。成功Build run→checkout SHA→Worker `atlasez-admin` Version→100%配信→公開build-infoを証拠で結ぶ。
2. D1 operator/Securityは固定本番D1のmigration ledgerをread-only再取得し、0134の状態を記録する。未適用ならbackupとrollbackを含む承認済み手順を作り、別途明示承認後にのみ適用する。mergeより前に適用済みを検証し、local successで代用しない。
3. Staging owner/Google admin/Resend admin/Discord adminは隔離Worker/D1、OAuth clientとsynthetic account、test sink、test guild/botを作成し、秘密値は管理対象secret storeに入れる。STG-01〜09を実施して証拠を添付する。Discord操作はOPSD-08の承認前に行わない。
4. 運営・Privacy・Security・SRE責任者はOPSD-01〜09の記入欄を承認し、限定人数・担当/代理・保持/削除・backup/restore・incident停止/再開・Discord方針を決める。候補値を承認済みとして扱わない。
5. 各PR担当は#546を先行させる統合計画に合わせてrebase/exact CIを実行する。mainへのmergeはBuildsの自動deploy挙動と0134を含むリリース順が承認され、未承認の本番変更が発生しない状態になってから実施する。
