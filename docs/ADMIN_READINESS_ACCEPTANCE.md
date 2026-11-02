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

## 2026-11-03 最新の隔離検証・判定

この節は過去の受入記録を上書きせず、最新mainから作成した隔離worktree上の実装・テストと、同日のread-only production確認を区別して記録する。コード変更の基点はADMIN `main` SHA `5e8dd7533e417b9237c232102856bfecd026e2c0`。実Google OAuth、実メール到達、Discord API、共有staging、本番への書込みは行っていない。

### 実装・検証結果

| 項目                                   | 状態                     | 証拠と範囲                                                                                                                                                                                                                                                          |
| -------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 応募保存と後続処理                     | PASS                     | 応募行・運営対応タスク・メールdelivery queueをD1 `batch` 内で作成するよう修正。task SQLを失敗させる隔離integration testで3種すべてrollbackし、同じ入力の再送で成功することを実SQLiteと実Worker routerで確認。provider設定の有無と実queue追加数をAPI応答で区別する。 |
| 二重応募・同時応募                     | PASS                     | 既存の実Worker/実SQL integration testを継続し、同時要求は1応募に収束し、負けた要求からtask/メールqueueが生まれないことを確認。                                                                                                                                      |
| 応募後の再試行UI                       | PASS                     | 375px Playwrightで503を成功表示せず、入力を保持して再試行できること、成功時だけ応募状況画面へ進むことを確認。API応答は仮データ。                                                                                                                                    |
| 採用・複数プロジェクト所属             | PASS                     | 実Worker Workflow APIと隔離SQLiteで既存Atlas membershipを保ったままThinking Cafe応募を審査・採用し、対象membershipだけ追加されることを確認。                                                                                                                        |
| 初回設定・初回タスク                   | PASS                     | 応募者から採用、初回プロフィール保存、ポータル到達後に担当者が初回タスクを割り当て、本人が`open → doing → done`へ更新。DB状態と監査イベントを確認。                                                                                                                 |
| 不採用後のアクセス                     | PASS                     | 既存integration testで応募状況は本人に表示し、会員API・会員画面を拒否しmembershipを作らないことを確認。                                                                                                                                                             |
| 役割境界・直接API                      | PASS（限定範囲）         | 実Worker integration testは全体管理者・プロジェクト責任者・分野担当・一般会員・応募者・不採用者・membership除去済み利用者の主要な対象scopeと、別プロジェクト応募/プロフィール/運営API拒否を確認。全ルート・全role matrixの網羅を意味しない。                        |
| 既存セッションの失効、休止・退会・復帰 | NOT TESTED（完全な受入） | membership除去・archived状態を扱う既存の隔離テストはあるが、全ロールで同じsessionを維持した休止/適用/復帰フローと外部role同期を一連で受け入れていない。                                                                                                             |
| Google OAuth / Cookie / CSRF           | BLOCKED                  | 実OAuth callback、アカウント選択、専用検証アカウントでのCookie属性・state再利用検証は未実施。                                                                                                                                                                       |
| メール・Discord                        | BLOCKED（実サービス）    | Mock/隔離テストは既存。今回の応募transaction試験ではprovider未設定時にも実際のqueue件数を区別。実メール到達、Discord連携・role付与/削除、timeout後の外部状態照合は未実施。                                                                                          |
| モバイル・アクセシビリティ             | PASS（自動検査範囲）     | `getting-started` E2Eを360/375/390/1280pxへ拡張し、axeを含む全Playwright suiteを実行。実機、200%拡大、スクリーンリーダーによる全画面受入は未実施。                                                                                                                  |
| ローカルDB migration                   | PASS（隔離環境のみ）     | 実Worker integration suiteは新規in-memory SQLiteへ全migrationを順番に適用。コード変更にschema/migrationはない。                                                                                                                                                     |
| 本番DB・backup/restore                 | BLOCKED                  | 本番migration statusのread-only照合では「No migrations to apply」。これは本番データ整合性、バックアップ保持、restore可能性、RPO/RTOの証拠ではない。export/restore/書込みは実施していない。                                                                          |

### 実行した検証コマンド

基点SHAに対するローカルworktreeで次が成功した。

| コマンド                                                                                  | 結果                                                                                                                                   |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                                                  | 成功。変更前lockfileではauditが22件（low 3 / moderate 16 / high 3 / critical 0）を報告。別の依存更新候補branchで修正を分離して検証中。 |
| `npm run verify:deploy-config`                                                            | 成功。固定ADMIN本番ターゲット設定を検証。deployは実行していない。                                                                      |
| `npm run check`                                                                           | 成功。358 files、0 errors / 0 warnings / 10 hints。                                                                                    |
| `npm run lint`                                                                            | 成功。                                                                                                                                 |
| `npm test`                                                                                | 成功。73 files / 588 tests。                                                                                                           |
| `npm run format:check`                                                                    | 成功。                                                                                                                                 |
| `ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ npm run build` | 成功。chunk size 500 kB超過等の既存build warningあり。                                                                                 |
| `npm run verify:build-info`                                                               | 成功。隔離buildのsource SHAは基点の`5e8dd7533e417b9237c232102856bfecd026e2c0`。                                                        |
| `npm run test:e2e`                                                                        | 成功。413件中399 passed / 14 skipped / 0 failed。axe検査を含む。production smokeはopt-inのため本番へ接続していない。                   |
| `git diff --check`                                                                        | 成功。                                                                                                                                 |

実装変更は専用branchにあり、この記録はローカル検証のみを証拠とする。GitHub PRのCI/レビュー結果は当該PRのexact-headで別途確認し、ローカル成功をmain反映、staging受入、本番受入の証拠にしない。

### 2026-11-03 production / GitHub 読み取り確認

- 公開`https://admin.atlasez.org/build-info.json`はmain SHA `5e8dd7533e417b9237c232102856bfecd026e2c0`、ref `main`、target `admin`を報告した。公開buildの時刻は`2026-10-14T07:54:26.721Z`。
- 固定Worker `atlasez-admin`のread-only Version/Deployment確認はVersion `ea236de8-3458-421c-a9ba-4030a9d86674`、100%配信、作成時刻`2026-10-14T07:55:28.329877Z`、source `Unknown (deployment)`。build-info一致だけではWorkers Buildsのprovenanceを証明しない。
- Issue [#509](https://github.com/Atlasez/Admin-Atlesez/issues/509)はOPEN（最終更新2026-10-13）。現在の公開build-infoはmainと一致するが、Worker Sourceは依然Unknown。Workers Builds復旧済みとは判定しない。
- 2026-11-02のproduction sync run `41420726517`は成功。これはbuild-infoとmainの照合であり、Cloudflare VersionのBuild provenanceを証明しない。認証済みChromeで主要画面を確認していない。
- Branch protectionの確認値はrequired check `verify`、strict=true、required approving reviews=0、admin enforcement有効。今回この値は変更していない。

### 受入阻害要因の分類

| 優先度                          | 状態                     | 根拠 / 必要な次の処置                                                                                                                                                                                  |
| ------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0: 応募データの部分成功        | 修正済み・隔離テストPASS | 以前は応募insert後のtask/email設定失敗を握りつぶし、HTTP 201と誤った`emailQueued`を返し得た。transaction化と失敗後再試行を実装。PR CI・レビュー・通常のmain配信後に再照合する。                        |
| P0: 本番provenance              | BLOCKED                  | Worker sourceがUnknown。Issue #509を継続し、Workers Builds成功runのcheckout SHAと固定Worker Versionを照合する。手動deployや設定変更で迂回しない。                                                      |
| P0: 実認証・全role matrix       | BLOCKED                  | 未認証/応募者/採用前/一般member/各scope担当/global admin/休止/退会済みで、専用隔離アカウントを使うUIと直接APIのexact-head確認が必要。                                                                  |
| P0: 外部状態                    | BLOCKED                  | 承認済みsandboxでResend/Discordの失敗・再試行・重複・権限失効を実測し、実受信/実role状態とqueue記録を照合する必要がある。                                                                              |
| P1: 受入体制                    | BLOCKED                  | OPSD-01/02/06/07について担当/代理/返信目安、受入上限/停止条件、queue確認頻度、停止・再開承認者が未決定。運営責任者の記録が必要。                                                                       |
| P1: 個人情報                    | BLOCKED                  | OPSD-03/04と公開repo PR [#140](https://github.com/Atlasez/Atlasez01/pull/140)の募集・privacy説明が未確定。目的、保持期間、削除、監査ログアクセス/保持を運営・privacy責任者が承認し公開説明に反映する。 |
| P1: backup / incident / Discord | BLOCKED                  | OPSD-05/08/09について暗号化backupのアクセス・保持・restore drill/RPO/RTO、Discord休止・退会時のrole方針、専用sandbox accountを運営/セキュリティ/SREが決定・検証する。                                  |

### GitHub open PR・Issueの現況

2026-11-03にGitHubのPR/APIとhead SHAのcheck-runsをread-only取得した。過去のCI成功は、そのPRの古いhead/baseに対する証拠としてのみ扱う。

| PR / Issue                                                        | 現在状態                                                                                                                                                | 判定                                                                                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#536](https://github.com/Atlasez/Admin-Atlesez/pull/536)         | OPEN。head `e27e9833eadc82af22266fe9e7eeec29f1e5ec48`、base SHA `074be85ff1fc5fd34952c49440dfa553270aa025`。verify成功は2026-10-13。                    | mainの現在SHAをbaseとしておらず、ログイン/404/エラー画面やfeature gate等を含む。API互換性を個別に再確認し、最新mainで差分・CIを更新するまで統合しない。                           |
| [#528](https://github.com/Atlasez/Admin-Atlesez/pull/528)         | OPEN・CONFLICTING。head `4f039648823e7a0860f5741235e20a629b69d78d`、base SHA `e63ab8b8ecca0dbe042e982fc19e9c3dffc7e370`。verify成功は2026-10-12。       | 未読数nullの扱いは現mainの`portalUnreadSummary()`で既に実装され、`AdminNav`も動的aria-labelを持つ。重複カウント修正は作らない。PR固有の変更は現mainとの差分を再確認してから扱う。 |
| [#527](https://github.com/Atlasez/Admin-Atlesez/pull/527)         | OPEN Draft・CONFLICTING。head `2f0386a5cb2f2efd14d3e7443311c61b71a83c06`、base SHA `e63ab8b8ecca0dbe042e982fc19e9c3dffc7e370`。verify成功は2026-10-12。 | backup scan最適化案。運用checkpoint・migration影響を現mainと照らす必要があり、未統合。                                                                                            |
| [#517](https://github.com/Atlasez/Admin-Atlesez/pull/517)         | OPEN・mergeable表示。head `39737a458451c2fe7c1bd4bba0f4677e8855ecc4`、base SHA `28b5f321af4bdd7177c92038935d0a5f1dc2f285`。verify成功は2026-10-09。     | Workers Builds障害経緯のdocs-only。Issue #509と新しいproduction read-only結果を基準に、重複・古い説明を整理してから判断。                                                         |
| [#505](https://github.com/Atlasez/Admin-Atlesez/pull/505)         | OPEN・mergeable表示。単一監査JSONの同期PR。head `7831f8c272e3329b7daa767d0de45cf98199c611`、baseは現在main SHA。head check-runなし。                    | JSONのみであることに加え、前回build-info SHAからmainまでの祖先関係・差分ファイルがJSONのみか読み取り検証が必要。merge可能表示だけで統合しない。                                   |
| [#526](https://github.com/Atlasez/Admin-Atlesez/pull/526)         | MERGED 2026-10-13。                                                                                                                                     | 受入機能・運用監査の内容はmainに含まれる。既に実装済みの機能を再構築しない。                                                                                                      |
| Issue [#509](https://github.com/Atlasez/Admin-Atlesez/issues/509) | OPEN、最終更新2026-10-13。                                                                                                                              | Workers Buildsのprovenance停止条件。現在のbuild-info一致でもクローズ/成功扱いしない。                                                                                             |

公開repo `Atlasez/Atlasez01` のmainとopen PRはread-onlyで確認した。PR #140の募集/privacy説明は未承認保持期間や運営判断に依存し、PR #141は問い合わせ導線等を扱う。ADMINの限定受入を行う前に、募集対象・応募先・目的・窓口が運営方針と一致するかを公開側責任者が確認する。別repoへの変更は行っていない。

### 5段階のGo / No-Go

| 判定                  | 状態                                            | 理由                                                                                                                                                |
| --------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code Ready            | BLOCKED（このPRの実装・ローカル自動検証はPASS） | 応募のatomicity fixと受入経路のローカルテストは成功。全role/API matrix、外部状態、専用sandbox検証が未了で、GitHub exact-head CIとレビューも未完了。 |
| Staging Ready         | BLOCKED                                         | この作業では共有staging・実OAuth/providerを利用していない。隔離SQLiteとPlaywright mockはstagingの代替ではない。                                     |
| Production Verified   | BLOCKED                                         | 公開build-infoとmain SHAは一致するが、Cloudflare sourceがUnknownで、認証済みChromeの画面証拠がない。                                                |
| Limited Intake GO     | BLOCKED                                         | OPSD-01/02/03/05/06/07/08/09、専用sandbox、production provenanceと権限・外部連携受入が未完了。                                                      |
| Public Recruitment GO | BLOCKED                                         | 限定受入が未承認。募集処理能力、プライバシー、返信目安、backup/incident準備、公開repo PR #140の判断が未完了。                                       |

### Limited Intakeへ進む最短手順

1. ADMIN開発担当がこの修正PRのreview/CIを完了し、承認後にmainへ統合する。統合・本番配信は別の明示承認に従う。
2. SRE/Cloudflare担当がWorkers Buildsの成功run、checkout SHA、Worker `atlasez-admin`のVersion/100%配信、公開build-info SHAを照合し、Issue #509の停止条件を解消する。復旧失敗時は配信を停止する。
3. 運営責任者・privacy責任者がOPSD-01/02/03/04/05/06/07/08/09を決定票へ記録し、募集・privacy説明を公開repoの既存PRへ反映する。Discord roleの保持/削除を未決定のまま実操作しない。
4. 運営担当が専用の応募者/会員/各role sandbox accountを用意し、承認済みstagingで応募から採用、初回設定、タスク完了、不採用、複数所属、退会/復帰、外部連携失敗をexact-headで実行する。DB/APIと通知の状態を照合し、実メール・Discordの到達確認は別途承認済み検証宛先で行う。
5. 運営責任者が限定人数・受付停止条件・対応担当/代理・連絡窓口を確定し、判定記録と証跡がそろった後にLimited Intakeを再判定する。承認前に本番招待や募集を開始しない。
