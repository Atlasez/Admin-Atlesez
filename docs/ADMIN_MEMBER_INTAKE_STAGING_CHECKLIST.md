# ADMIN新規メンバー受入：運営決定・staging実施チェックリスト

作成日: 2026-11-03 JST  
状態: **未実施／未承認**。このチェックリストは運営判断と隔離環境の準備票であり、募集開始・実ユーザーへの通知・本番変更を許可するものではない。

## 実施前の停止条件

- [ ] ADMINの対象commit、CI、Worker名、staging URL、staging D1 IDを記録した。stagingは本番Worker・本番D1・本番Route・本番OAuth clientと分離されている。
- [ ] staging Workerが接続するDB、Cron、queue、送信provider、Discord guildを一覧化し、本番の共有D1・外部通知・実メンバーへ到達しないことを確認した。
- [ ] 専用合成アカウントの利用者とcleanup担当を承認した。既存個人アカウントや一般メンバーで代用しない。
- [ ] staging用secretは専用のsecret storeに登録した。値・OAuth token・Cookie・認証コードをPR、Issue、スクリーンショット、テストログへ記録しない。
- [ ] 対象SHAのCIが成功し、stagingだけに必要なmigrationが適用済みであることをread-onlyで確認した。migrationはレビュー済み手順でstagingにのみ適用する。
- [ ] OPSD-01〜09のうち、この試験に必要な決定を承認済み運営者が記入した。未決定のDiscord方針や個人情報保持値を試験者が補完しない。

**一項目でも未完了なら外部サービスを使う試験を開始しない。** ローカルSQLite/Mock試験は本番・stagingへの接続なしで継続できる。

## 既存stagingのread-backと合成サービス準備

2026-11-04 UTCのread-only確認で、Cloudflare上の専用Worker `atlasez-admin-staging` と別D1 `atlasez-admin-staging-reports` が存在し、専用 `workers.dev` originを使い、Custom Routeとscheduled triggerはありません。候補migration一式（0134を含む）を指定したD1 migration listはpendingなしでした。WorkerはVersion prefix `ef25f36d`が100%配信、Source `Unknown`で、live `build-info.json`は古いcommit `a509d52b5ad766d5cd41ad438ddf0040c7c13daa`, `ref=unknown`を返しました。current candidateの配信証拠ではありません。

既存staging D1には運営者identityと試験データがあるため保持します。**既存Worker/D1を作り直す、削除する、空にする、role tableをresetする、またはrestoreする操作をしないでください。** Google Cloud Consoleの専用client/callback/test-user一覧は未確認で、運営者とは異なるsynthetic applicant/member・project reviewerは未準備です。Resend/Discordは設定上disabledですが、provider呼出し回数は計測していません。これらのread-back以降に設定差分を見つけた場合も、修正やresource作成の前に別途承認を取得します。

以下の新規Worker/D1作成・空DB migration手順は、**新たな使い捨て環境が必要と判断され、個別変更承認が得られた場合のみ**の条件付き手順です。現在のstagingには適用しません。作業中に本番 `atlasez-admin`、本番D1、`admin.atlasez.org` のroute/secretを参照・変更しないでください。

### 1. Cloudflare WorkerとD1

1. Cloudflare管理者はまず既存Worker/D1の名前・匿名resource ID・owner・cleanup担当をread-onlyで記録する。現在確認済みのWorker/D1を再作成しない。欠落またはproductionとの混在が見つかった場合は、対象を使わず個別変更承認を待つ。
2. ADMIN maintainerは既存のignored staging configをread-backと照合する。`name`、origin、D1 bindingはstaging専用値とし、本番の`wrangler.admin.jsonc`設定をコピーしない。現在のread-backと一致しなければdry-run/deployへ進まず停止する。
3. Cloudflare管理者がWorker/D1 binding、route、Cron状態、環境変数名だけをread-onlyで確認する。現在のread-backはCustom Routeなし、Cron 0件です。Cronを追加・変更せず、メールproviderはdisabled、Discord providerはdisabledの状態を維持する。隔離を証明できなければ停止する。
4. 対象SHAのADMIN buildと専用configのdry-runをローカルで確認する。dry-runは実環境の分離やdeploy許可を証明しない。現Workerへの配信はstaging専用の明示承認後だけ行う:

   ```bash
   npm run verify:deploy-config
   ATLASEZ_BUILD_TARGET=admin SITE_URL=https://<STAGING_HOST> BASE_PATH=/ npm run build
   npm run verify:build-info
   npx wrangler deploy --dry-run --config wrangler.admin.staging.jsonc
   ```

   `<STAGING_HOST>`は承認済みのstaging hostnameへ置き換える。dry-runのWorker名とD1 bindingを二名で確認する。Stagingへの配信は専用staging手順で別途承認し、本番Deploy手順を流用しない。

5. **次のapply例は別途承認された新しい使い捨てD1だけに使用する。既存staging D1には実行しない。** その場合も対象名・D1識別子とmigration listを先にread-backし、個別のD1変更承認を得る。

   ```bash
   npx wrangler d1 migrations list <STAGING_D1_NAME> --remote --config wrangler.admin.staging.jsonc
   npx wrangler d1 migrations apply <STAGING_D1_NAME> --remote --config wrangler.admin.staging.jsonc
   npx wrangler d1 migrations list <STAGING_D1_NAME> --remote --config wrangler.admin.staging.jsonc
   ```

   新規の使い捨てD1演習でだけmigration適用記録と`0134_application_intake_reconciliation.sql`を含む対象SHAを保存する。本番名 `atlasez-reports`、本番config `wrangler.admin.jsonc`、本番D1 UUIDはコマンドへ指定しない。既存staging D1は2026-11-04のread-only listでpendingなしを確認済みのため、追加migrationは適用しない。

### 2. Google OAuthの合成アカウント

1. Google Cloud管理者はまず既存専用OAuth clientのAuthorized JavaScript origin、`https://<STAGING_HOST>/auth/google/callback` redirect URI、test-user一覧をread-onlyで確認する。コードのcallback routeは `/auth/google/callback`。既存clientがないことを確認した場合に限り、Google管理者の個別変更承認後に作成する。
2. 運営者identityとは異なる管理下synthetic applicant/memberとproject-scoped reviewerを用意する。アカウント作成・test-user登録にはGoogle Cloud管理者の承認が必要。個人・運営者の通常アカウントをrole境界の証拠に転用しない。test account pseudonym、OAuth client pseudonym、cleanup ownerだけを台帳へ記録する。
3. Client ID/Secretはstaging Workerの専用secret storeへだけ登録する。secret値、OAuth `state`、認証code、Cookieを記録しない。OAuth同意・callback・logout後の再login・取消からの回復をSTG-01で確認する。

### 3. Resendのtest sink

1. Resend担当者がstaging専用project/API keyと、合成宛先だけを受け取るtest sinkまたは隔離mailboxを用意する。staging senderはsinkで受信確認できるものにし、本番API key・本番宛先リスト・一般応募者へ到達できないことを確認する。
2. staging Workerには専用 `RESEND_API_KEY` と `EMAIL_FROM` だけを登録する。通知先を設定する場合も合成運営アドレスだけに限定する。値はsecret storeに置き、`wrangler` config・PR・テスト証跡へ書かない。
3. STG-07でAPI受理、sink受信、provider最終イベントを別々に記録する。API 2xxだけを受信成功としない。503/timeout時は同一delivery IDのidempotency keyとqueue状態を照合し、実メールは送信しない。

### 4. Discordのtest guild

1. Discordはdisabledのまま維持する。OPSD-08でSTG-08が承認された場合に限り、Discord管理者が本番guildから分離したtest guildとsynthetic Discord userを用意する。Botには試験に必要な権限だけを与え、対象test roleより上位に置く。role ID・user IDはpseudonymで記録する。
2. 専用OAuth applicationのredirect URIを `https://<STAGING_HOST>/auth/discord/callback` に設定する。staging Workerの `DISCORD_OAUTH_REDIRECT_URI` を同じURIにする。Guild ID、OAuth client ID、client secret、Bot token、token encryption keyはstaging専用値とする。
3. secretと32-byte暗号化鍵はstaging secret storeへ登録し、鍵/tokenの値を証跡に含めない。本人同意を得たsynthetic userだけでSTG-08を行う。grant/revoke前にOPSD-08を承認し、失効後はサイトAPIとDiscord側read-backを別に確認する。

### 5. 実行者と環境境界の最終確認

STG-01〜09の開始前に、Cloudflare管理者はWorker名・route・D1 binding、Google管理者はOAuth client/callback、Resend担当者はsink到達先、Discord管理者はtest guild/roleをそれぞれ識別子だけで読み合わせる。ADMIN maintainerは対象SHA・CI・migration statusを確認し、運営責任者はsynthetic account・試験範囲・cleanupを承認する。いずれかのowner、資格情報、分離証拠が不足すれば、該当する外部試験を**BLOCKED**にし、SQLite/Mock試験を別に記録する。

この文書はstagingを作成・設定・deployする権限を付与しない。専用Worker/D1/OAuth/providerの作成や設定はCloudflare/Google/Resend/Discordの各管理者が個別の変更手順と承認に従って行う。本番設定値を流用したり、本番migrationを適用したりしない。

## 運営責任者が記入する決定票（OPSD-01〜09）

チェックした選択肢だけで決定を確定しない。必須欄を記入し、決定者が承認した後に状態を`APPROVED`へ変更する。空欄・複数選択・署名なしは`PENDING`のままとする。保存期間、上限、SLAなどの未承認値はWeb画面や公開文面へ表示しない。

| ID                                      | 選択・記入欄（承認者が記入）                                                                                                                                                                                                                                                                | 必須記録と完了条件                                                                                                                        | 決定責任role                             | 状態／承認                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------- |
| OPSD-01 応募・運営の担当                | [ ] 各queueに主担当と代理を割当 [ ] 共通当番を設定 [ ] 担当不在時に受付停止。応募確認、採否、分野レビュー、初回設定、障害、相談・休止・退会ごとに主担当role、代理role、連絡経路、対応時間帯、初回応答目安、期限超過時の連絡先を記入。                                                       | 担当表が全queueを覆い、代理者が引継ぎを机上確認。公開募集の返信目安と一致。                                                               | 運営責任者、各project lead               | 状態: ____　決定日: ____　承認者role/署名: ____ |
| OPSD-02 少人数受入の容量                | [ ] 招待制の限定受入 [ ] project限定 [ ] その他（要記述）。最大人数、期間、対象project、同時審査件数、未対応queue上限、受付一時停止の閾値と停止担当、再開承認者、限定運用の振返り日を記入。                                                                                                 | 数値入り計画、上限到達時の本人向け案内、停止・再開担当が揃う。一般募集は限定運用の記録と振返り後に別決定。                                | 運営代表、各project lead                 | 状態: ____　決定日: ____　承認者role/署名: ____ |
| OPSD-03 応募・profile等の保存           | [ ] データ種類ごとに期間を決定 [ ] 削除条件を決定 [ ] 保存期間の専門確認が必要。応募/profile、採否確定済み応募、審査メモ、問い合わせ、session/rate limit、記事報告のhash/contact、backup copyを分け、利用目的、保存期間、起算イベント、例外、削除依頼窓口、削除実行者、削除確認方法を記入。 | 承認済み保持表が公開プライバシー説明、削除手順、backup保持と一致。未承認の保持値をコードで有効化しない。                                  | privacy責任者、運営責任者                | 状態: ____　決定日: ____　承認者role/署名: ____ |
| OPSD-04 監査ログの個人情報              | [ ] 現行記載の保持案を採用 [ ] 期間短縮 [ ] 識別情報を分離・削除し統計だけ保持 [ ] その他。各ログ項目、用途、閲覧可能role、検索理由、archive期間、削除可否、アクセス記録、応募/profile保持との違いを記入。                                                                                  | 監査ログの目的・アクセスrole・保持削除が承認され、公開説明と整合。既存の730日記載は承認済み決定とみなさない。                             | privacy責任者、ADMIN管理者               | 状態: ____　決定日: ____　承認者role/署名: ____ |
| OPSD-05 backup・復元                    | [ ] D1 Time Travel [ ] 暗号化exportを分離保存 [ ] 手動export [ ] 複数方式。採用する保存先の識別名、頻度、暗号化、閲覧role、保持削除、失敗通知、restore承認者、実測RPO/RTOを記入。                                                                                                           | 隔離環境でのrestore・整合性検証と所要時間を記録。backupが存在するだけで復元可能とは扱わない。                                             | D1運用担当、security責任者               | 状態: ____　決定日: ____　承認者role/署名: ____ |
| OPSD-06 障害・queue監視                 | [ ] 当番が定時確認 [ ] 閾値でalert [ ] 併用。応募/メール/Discord/Cron/公開queueごとに確認頻度、最古滞留時間、再試行枯渇条件、障害判定時間、alert先、一次応答者、エスカレーション先を記入。                                                                                                  | stagingで失敗注入→alert受信→acknowledge→引継ぎを実証。設定済み、provider accepted、送信API成功だけで実配達・復旧成功とは扱わない。        | 運営責任者、各service担当                | 状態: ____　決定日: ____　承認者role/署名: ____ |
| OPSD-07 停止・復旧権限                  | [ ] 指定operatorが停止し責任者が復旧承認 [ ] 二名で停止・復旧 [ ] 管理者へ即時エスカレーション。停止条件、停止可能role、Worker/Cron/queueの安全な停止順、共有D1への影響、連絡先、再開条件、復旧承認者を記入。                                                                               | 承認済み手順で机上演習を実施。Cloudflare/GitHubの設定変更、本番停止・再開は個別承認なしに実施しない。                                     | 運営責任者、Cloudflare管理者、D1運用担当 | 状態: ____　決定日: ____　承認者role/署名: ____ |
| OPSD-08 Discord roleの停止・退会・復帰  | [ ] 休止/退会時に全roleを解除 [ ] Atlasez内scopeだけ停止しDiscord role維持 [ ] 対象project roleだけ解除 [ ] 状態ごとに異なる方針を表で決定。休止、project離脱、恒久退会、復帰、連携失敗時を分け、本人への説明、Bot失敗時の停止状態、手動確認者、再連携条件を記入。                          | role grant/revokeとサイト認可が一致するstaging結果を保存。本人同意と運営承認のない連携・削除をしない。未決定中はDiscord依存の受入を停止。 | 運営責任者、Discord管理者                | 状態: ____　決定日: ____　承認者role/署名: ____ |
| OPSD-09 隔離staging・合成roleアカウント | [ ] 専用staging Worker/D1 [ ] provider別sandbox [ ] まずMockのみ。staging URL、Worker識別、D1 UUID、OAuth client識別、Resend環境、Discord test guild/bot、各synthetic account pseudonymとrole、fixture作成・削除担当を記入する。secret値・個人メールはここへ書かない。                      | 本番からの隔離を読み取りで確認し、各roleのUI/API matrix、test data初期化・cleanup、利用者の承認が完了。                                   | ADMIN maintainer、各role owner           | 状態: ____　決定日: ____　承認者role/署名: ____ |

決定票の記録先（承認済み運営記録。個人情報をこのrepoへ保存しない）: ____  
根拠・関連Issue/PR: ____　公開文面/手順の更新担当: ____　次回見直し日: ____

## staging環境・合成アカウント台帳

既存の専用staging Worker/D1をread-onlyで識別し、worker.dev origin・Google OAuth・provider設定・bindingが本番と分離されているか確認する。新しいstaging resourceやproviderは不足が明確で、個別の変更承認がある場合だけ準備する。既存の試験データと運営者identityを保持し、cleanupやresetをしない。stagingアプリに本番secretや本番D1 bindingが残っていないことを、値を表示せずbinding名・環境IDで確認する。

下記の空DB migration/apply手順は新しい使い捨てD1の演習専用です。既存 `atlasez-admin-staging-reports` は2026-11-04 read-only確認で0134を含むcandidate migrationにpendingなしでした。既存D1にapply、初期seed削除、reset、restoreをしません。

| Pseudonym            | 初期状態・role                       | 用途                                    | cleanup owner | 準備状態 |
| -------------------- | ------------------------------------ | --------------------------------------- | ------------- | -------- |
| `applicant-fresh`    | 新規Google account、応募/profileなし | OAuth、profile、応募                    | ____          | PENDING  |
| `applicant-review`   | 審査中の合成応募                     | 面談・審査・状態確認                    | ____          | PENDING  |
| `applicant-rejected` | 不採用の合成応募                     | 結果表示とAPI拒否                       | ____          | PENDING  |
| `member-project-a`   | project A所属、一般メンバー          | 既存所属維持、別project応募、初回タスク | ____          | PENDING  |
| `manager-project-a`  | project A責任者、Bはscope外          | 所属projectの応募・審査、Bの拒否        | ____          | PENDING  |
| `subject-lead-a`     | project A分野担当者                  | 担当分野scopeの境界                     | ____          | PENDING  |
| `global-manager`     | 全体管理者                           | 全体管理画面の許可範囲                  | ____          | PENDING  |
| `member-suspended`   | 休止状態                             | 既存sessionの失効、再開                 | ____          | PENDING  |
| `member-withdrawn`   | 退会済み状態                         | API拒否、復帰scope限定                  | ____          | PENDING  |

全て専用の検証アカウントまたはMock fixtureとし、実メンバーを使わない。実Google OAuthでは管理されたsynthetic Google accountだけを選択する。Resend/Discordの外部連携は専用projectとtest guildのみを使い、宛先・アカウント識別子は安全な運営保管先に置く。

## 実施順・受入シナリオ

各シナリオはUI操作だけでなく、許可されたstaging APIを同じrole sessionで直接呼び、HTTP statusとDB状態を照合する。D1はstaging read-only queryで行数・仮ID・状態だけを見る。秘密値や応募者の入力本文は証拠に含めない。

| ID / actor                                                                          | 手順                                                                                                                                                                           | 合格条件                                                                                                                                                                                                                              | 保存する証拠                                                                                                                               |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| STG-01 OAuth / `applicant-fresh`                                                    | 専用staging URLの未認証ページからGoogleログイン。許可済みsynthetic accountを選択し同意、callback後にログアウト・再ログインも実施。                                             | state/nonce/cookie/callbackが正常、同一Google identityに結合。session cookieは安全属性付き。未認証APIは拒否、応募者をmember/adminにしない。失敗・取消後に再試行可能。                                                                 | staging URL識別子、SHA、OAuth client pseudonym、callback結果/status、cookie属性名のみ、擬似user ID。state/token/cookie値は保存しない。     |
| STG-02 Profile・応募・再送 / `applicant-fresh`                                      | 基本profileを保存してページ再読み込み、途中保存・再開。project Aへ応募し、二重クリックと並行POST、応答timeout後の再送を実施。応募statusページを開く。別project Bにも応募する。 | 入力検証、保存値、projectごとの応募、既存応募確認が正しい。timeout後の再送409は失敗表示にならず既存statusへ移動。application/task/queueが想定行数。commit状態が不明なら成功・rollbackと断定せず運営確認を表示。provider送達は別扱い。 | 相関ID、HTTP status/code、匿名fixture ID、app/task/queueの前後行数、status画面のPII除去画像、重複回数。                                    |
| STG-03 審査・不採用 / `manager-project-a`, `applicant-review`, `applicant-rejected` | manager Aが対象応募を閲覧、面談記録、審査状態変更、受入ではなく不採用経路を選ぶ。応募者sessionと直接APIで状態を確認。                                                          | 対象project scopeの応募だけ閲覧・変更可。履歴にactor/時刻/旧新状態。二重・古い更新は409等で検出。rejectにmembership/portal/task管理権限を作らない。本人は結果を見られるがprotected APIは拒否。                                        | role別status、監査行数・actor pseudonym、拒否HTTP code、membership=0、保存前後の状態。応募内容なし。                                       |
| STG-04 複数所属 / `member-project-a`, `manager-project-a`                           | A所属memberがBへ応募。B担当者がBだけを受入。操作前後にA/Bのmembership・permissionを照合。A/BのAPIを両roleで呼ぶ。                                                              | A所属が維持されBだけ追加。対象projectの権限だけ付与。Aのtask/calendar/membershipが消えない。manager AはB応募にアクセス不可。                                                                                                          | project pseudonym別membership/permission件数、対象外API拒否status、監査event。                                                             |
| STG-05 初回設定・初回task / 新規受入member                                          | 受入後に同じGoogle accountでlogin、プロフィール・project自己紹介を保存し、getting-started/portalへ移動。自分のtask、calendar、資料を確認。合成taskをopen→doing→doneへ更新。    | onboardingは実DB状態に対応。所属projectだけ見える。本人の許可済みscopeでtask更新でき、他人のtaskは拒否。一般memberに管理roleを付けない。保存失敗・通信切断は成功表示しない。                                                          | profile completion flags、project scope、task state transition、403/API拒否、360/375/390pxまたは375px画像、PIIなし。                       |
| STG-06 休止・退会・復帰 / `member-suspended`, `member-withdrawn`                    | 引継ぎ中taskを確認。申請・取下げ・審査・適用を別fixtureで試験。権限を失効させ、古いsessionの直接URLとAPIを再呼出し。承認済み再開を行い、membership/roles再確認。               | lifecycle状態と既存session/APIが一致し、失効後は直接APIも拒否。別project membershipを勝手に消さない。再開時に過去の応募だけでmemberを復活させず、許可済みscopeのみ戻す。監査履歴が残る。Discord側操作はOPSD-08承認前に行わない。      | 旧sessionの401/403、project別行数、監査event、再開scope表、未完了task引継ぎ確認。                                                          |
| STG-07 Resend / `applicant-fresh`                                                   | staging credentialとResend sandbox/test sinkを確認し、受付・面談・採否の各templateを試験。503、timeout、同一idempotency再送、queue滞留/枯渇を注入。                            | queue作成・provider受理・配達イベントを別状態で表示。重複送信がない。provider失敗はqueueにretryable/failed状態で残る。受信箱で検証する場合もsynthetic宛先と承認済みtest sinkのみ。                                                    | queue pseudonym ID、attempt/status、provider event ID、sinkでの受信確認時刻。recipientや本文なし。                                         |
| STG-08 Discord grant/revoke / 専用test guildのsynthetic user                        | OPSD-08承認後のみ、Discord consentを行い、project roleを付与。bot権限・role hierarchyを確認。失敗・timeout・再試行を注入し、その後に承認済みの休止/退会role処理と復帰を行う。  | provider応答またはread-backでgrant/revokeを検証。サイト側権限失効をDiscord成功と推測しない。失敗時は`pending/failed`で原因と再試行案内を表示し、管理権限を誤付与しない。重複操作は安全。                                              | test guild pseudonym、synthetic user pseudonym、role ID pseudonym、HTTP/provider status、同期記録IDと時刻。access token/guild招待URLなし。 |
| STG-09 通信・DB・queue障害 / 上記各role                                             | read-only失敗、DB transaction error、500/timeout、session期限切れ、空データ、通知queue滞留を注入。操作再読込・戻る・再試行・運営案内を確認。                                   | 未確定状態を成功表示しない。保存済みか不明なら重複防止と状態確認へ誘導。権限拒否、空状態、通信失敗、保存失敗が別表示。次の運営連絡先が分かる。                                                                                        | injection種別、status/code、request correlation ID、再試行回数、状態前後の件数、PIIなしの画面画像。                                        |

### 現行APIとの対応

下記はWorker router上で確認した経路。stagingではURLを対象Worker originへ相対指定し、各roleのsessionからUIと同じAPIを直接呼び出す。IDは同じ隔離DBから得た合成fixtureだけを使う。

| 試験      | 画面 / API                                                                                                                                                                                                                     | 実行内容・境界                                                                                                                                                                                                                                                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| STG-01    | `/admin/login/` → `GET /auth/google/login` → `GET /auth/google/callback`                                                                                                                                                       | OAuth開始・callback。未認証の `/api/applicant/me` は401、採用前に管理APIへアクセスしても拒否されることを確認する。                                                                                                                                                                                                                                                                            |
| STG-02    | `GET/POST /api/application-profile`、`POST /api/apply`、`GET /api/applicant/me`                                                                                                                                                | `POST /api/apply` の正常結果は `applicationState=saved`、`responseTaskCreated=true`、queue件数を返す。`emailDeliveryStatus=queued` はprovider配達完了を意味しない。保存後の応答喪失を再送すると409 `APPLICATION_ALREADY_EXISTS`となり、`/applicant/?submission=already-received`で自分の状態を確認できる。pendingマーカーとqueue/tasksの照合・修復はPR #545のmigration 0134適用後に確認する。 |
| STG-03/04 | `GET /api/admin/applications?project=<slug>`、`PATCH /api/admin/applications/<application-uuid>?project=<slug>`、`GET/PUT /api/admin/applications/<uuid>/interview`、`GET/PUT /api/admin/applications/<uuid>/interview-review` | managerは対象project内だけで応募・面談・審査を行う。状態更新は期待状態が古い場合に409となる。受入後は `/api/applicant/me` と `/api/user/status`、隔離D1でproject別membershipを確認する。                                                                                                                                                                                                      |
| STG-05    | `GET/POST /api/onboarding/me`、`GET/POST /api/onboarding/project`、`GET/POST /api/onboarding/tutorial`、`GET /api/admin/member-tasks`、`PATCH /api/admin/operations/tasks/<task-uuid>`                                         | 本人の初回profile/自己紹介/onboarding状態を保存し、所属・担当範囲内のtaskだけopen→doing→doneへ更新する。別project・他人のtask IDを直接指定し403/404とDB不変を確認する。                                                                                                                                                                                                                       |
| STG-06    | `GET/POST /api/admin/member-procedures?project=<slug>`、reviewは `?project=<slug>&view=review`                                                                                                                                 | 本人がpause/withdrawal/restartを申請・取下げし、別の権限者が承認/却下する。予定適用は専用staging Cronで確認し、旧sessionのAPIを再呼出しする。Discord grant/revokeはOPSD-08承認後のSTG-08だけで扱う。                                                                                                                                                                                          |
| STG-07/08 | `GET /api/admin/discord-readiness`、`GET /auth/discord/start`、`GET /auth/discord/callback`、`POST /api/admin/applications/<uuid>/discord-retry`                                                                               | readinessの設定表示を接続成功とみなさず、専用Resend sinkの受信イベントと専用Discord guildのread-backを別々に確認する。STG-08は本人同意とOPSD-08承認後に限る。                                                                                                                                                                                                                                 |

path/roleを変更するPRが入った場合は、この対応表を実装と再照合してからstaging手順を実施する。確認用のD1クエリは専用staging D1へread-onlyで行い、本番名・production configを指定しない。

### API/UI role matrix

同じ合成応募・プロフィール・記事・taskについて、UIの表示だけでなく直接APIで検証する。`403`/`404`等の正確なstatusはendpoint contractを基準とし、他人のデータを返さないことを必須とする。

| role/state          | 自分の応募status        | 他人/別project応募・非公開profile | 自分のmembership/task      | 管理・審査API         |
| ------------------- | ----------------------- | --------------------------------- | -------------------------- | --------------------- |
| 未認証              | 拒否                    | 拒否                              | 拒否                       | 拒否                  |
| 応募者/審査中       | 自分の応募だけ許可      | 拒否                              | member portal拒否          | 拒否                  |
| 不採用者            | 自分の結果だけ許可      | 拒否                              | member portal拒否          | 拒否                  |
| 受入済み/初期設定中 | 自分の結果/profile許可  | 拒否                              | 付与済みprojectのsetupのみ | 拒否                  |
| 一般member          | 自分の情報・許可scope   | 拒否                              | 所属project内のみ          | 拒否                  |
| project責任者       | 割当projectのみ         | scope外は拒否                     | 付与scope内                | 対象projectのみ許可   |
| 分野担当者          | 担当範囲のみ            | 他project/他分野は拒否            | 許可scope内                | 担当業務だけ許可      |
| 全体管理者          | 運用上許可された範囲    | audit/log対象を含め職務scope内    | 許可scope内                | 許可された管理APIのみ |
| 休止中member        | 自分の手続き/案内のみ   | 拒否                              | 停止されたscopeを拒否      | 拒否                  |
| 退会済みmember      | 自分の退会/再開案内のみ | 拒否                              | すべて拒否                 | 拒否                  |

全roleでrole失効後の既存session、直接URL、APIを再確認する。UIでボタンを隠すだけでは合格にしない。

## 証拠の形式と保管

各実行の記録は次の形式を使い、アクセス制限された運営保管先へ保存する。

```text
Test ID / 実施日時(UTCとJST) / 実施者role / staging識別子
ADMIN commit SHA / CI run URL / Worker Version pseudonym / staging D1 pseudonym
synthetic actor pseudonym / endpointまたは画面 / 期待結果 / 実結果(PASS|FAIL|BLOCKED)
HTTP status・machine code / correlation ID / pseudonymized provider event ID
before/afterの行数・状態 / PIIを除いた画像またはログ / cleanup結果 / 追跡Issue
```

証拠には氏名、実メールアドレス、OAuth token/state、Cookie、Discord access token、応募本文、Resend本文、secret、実利用者の画像を含めない。画像を保存する場合はアカウント選択情報、個人名、URL query、通知内容を塗りつぶし、同じstaging runのcommitとtest IDを付ける。providerのAPI成功だけを実着信・Discord反映の証拠にせず、sink/read-backの結果を別に記録する。

## 現在の準備状況と承認欄

- 専用staging Worker/D1/OAuth client/Resend sink/Discord test guild: **未確認・BLOCKED**。
- 実Google OAuth callback、実メール到達、Discord実role grant/revoke、role別Chrome受入: **未実施**。
- SQLite/Worker/Mock providerを使う自動試験: 該当するPRのexact-head CIとテスト報告で確認する。これらは実サービス到達の代替ではない。
- OPSD-01〜09: **未承認**。候補・推奨は運営決定ではない。

運営責任者: ____　決定日: ____　承認対象環境: ____　承認対象commit: ____  
セキュリティ/プライバシー確認role: ____　staging owner: ____　cleanup owner: ____  
限定受入への判断: [ ] NO-GO [ ] 別途承認後に再判定　根拠記録: ____

このチェックリストへの署名だけで、本番配信、D1変更、実メール、Discord変更、実ユーザー招待、募集開始を許可しない。各行為は既存の明示承認・変更手順に従う。

## 限定受入リリースの停止条件と順序

この節はリリース担当者が承認済みの変更手順を組み立てるための確認票であり、Cloudflare・D1の操作権限や実行承認を付与しない。空欄や確認不能が1つでもあれば停止する。

### PR merge前の確認

- [ ] 最新のmain SHA、対象PR HEAD、差分、レビュー結果、required `verify`のexact-head successを記録する。rebase・競合解消・追加commit後は、その新HEADのCIを使う。
- [ ] Cloudflare管理者がWorkers Buildsの接続repository、Production branch `main`、Preview無効、Build/Deploy command、対象Workerを読み取り確認する。PR mergeでproduction buildが起動し得るか明示する。設定を確認できない場合は「自動配信なし」と推測せず、PR mergeを止める。
- [ ] Issue #509のprovenance gateとして、成功したBuild run ID、checkout SHA、固定Worker `atlasez-admin` のVersion、100%配信、公開build-infoを照合する。build-infoとmainのSHA一致だけでは合格にしない。
- [ ] D1運用者が固定された本番D1の現在のmigration ledgerをread-onlyで取得する。権限エラー、古い結果、対象DBを識別できない出力は未確認扱いとする。
- [ ] PR #545を含む新Workerを配信する前に、承認済みbackup・migration手順で `0134_application_intake_reconciliation.sql` を本番D1へ適用し、read-only ledgerで適用を確認する。実行者、承認者、対象DB識別子、対象SHA、時刻、結果を別々に記録する。PR mergeの許可をmigration許可に読み替えない。
- [ ] 運営責任者がOPSD決定票の必要項目、少人数上限、担当/代理、停止・復旧担当を承認する。未決定の保存期間、SLA、Discord role方針を公開・実行しない。

### mergeと配信の順序

Issue #548の順序案は `#546 → #545 → #547`。この順序はCloudflareのproduction buildが安全に制御・検証でき、各merge後のmain CIと配信証拠を見て次へ進める場合だけ使う。必要なmigrationが未確認、Workers Builds provenanceが未解決、または自動配信の発生有無を確認できない場合は、独立したdocs-only PRを含めmergeしない。

各merge後にmain SHA、CI run、Cloudflare Build/Deployment/Version、配信率、build-infoを記録する。異常があれば次のPRをmergeせず、deploy・rollback・promote・cache purgeを推測で実行しない。

### 配信後の確認と復旧

- [ ] 承認されたmain SHAのWorker Versionが固定Workerへ100%配信され、Build run/checkout SHAと一致する。
- [ ] 認証済みChromeでlogin、応募者status、portal、task、calendar、profile、対象projectのapplicationsを確認する。合成roleに対応する許可/拒否APIも確認し、実会員の応募・採用・role変更を行わない。
- [ ] 応募row、対応task、期待メールqueue、reconciliation markerを隔離データで照合する。メールproviderの受理、sinkでの受信、Discord側read-backをそれぞれ分けて記録する。
- [ ] アプリの問題はレビュー済みrevert PRとWorkers Buildsで戻す。migration 0134の列/indexを削除せず、送信済みメールを復旧操作で再送しない。D1復元は対象・影響を別途レビューし、承認されたrunbookでのみ行う。

| 承認role                   | merge/deploy可否 | migration/backup確認      | OPSD必要承認               | 証跡URL・日時 |
| -------------------------- | ---------------- | ------------------------- | -------------------------- | ------------- |
| Cloudflare / release owner | ____             | 対象SHA・Version: ____    | N/A                        | ____          |
| D1 operator / security     | N/A              | backup・0134 ledger: ____ | OPSD-05/07: ____           | ____          |
| 運営責任者 / privacy責任者 | N/A              | N/A                       | OPSD-01〜04/06/08/09: ____ | ____          |
