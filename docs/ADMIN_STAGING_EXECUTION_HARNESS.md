# ADMIN専用stagingの実行基盤

作成日: 2026-11-03 JST
状態: **ローカル隔離試験を実装済み。専用stagingと実サービス受入は未構築・未実施。**

本書は [PR #547のADMIN新規メンバー受入チェックリスト](https://github.com/Atlasez/Admin-Atlesez/blob/3281a7b05f7b566cc2acc0ace62277428b9deef2/docs/ADMIN_MEMBER_INTAKE_STAGING_CHECKLIST.md) を実行するための設定ガード、fixture、migration drillを定めます。Cloudflare設定変更、staging deploy/migration、Google/Resend/Discordの実接続は、このPRだけでは実行しません。

## 1. 隔離設定と検査

- `wrangler.admin.staging.example.jsonc` は意図的に無効なAccount ID、D1 ID、OAuth/Discord IDを含む雛形です。deployに使わないでください。
- ローカル設定は雛形を `wrangler.admin.staging.jsonc` へコピーして作成します。このファイルは `.gitignore` 対象です。secret値、synthetic recipient一覧、Cookie、OAuth state/code/tokenをGitへ追加しないでください。
- 0134以前のWorker互換性をCloudflare上で確認する場合は、通常設定を複製した `wrangler.admin.staging.compat.jsonc` から `triggers` を削除し、`npm run verify:admin-staging-config:compat` で検査します。これは旧Worker用の一時設定であり、staging WorkerのスケジュールもDashboardで無効化・read-backしてから使います。
- `npm run verify:admin-staging-config:template` は雛形に対し静的検査をします。実設定は `npm run verify:admin-staging-config` で確認します。
- 検査はWorker名を `atlasez-admin-staging`、D1名を `atlasez-admin-staging-reports`、`workers.dev` originのみ、Custom Routeなし、Preview URLなし、専用Google/Discord ID、test送信元/通知先に固定します。本番Worker、D1、route、Discord guild/client ID、secrets in `vars`、production Cron群を拒否します。
- stagingの `*/5 * * * *` CronはWorker側でstaging `workers.dev` originまたはstaging変数を認識した場合に `ATLASEZ_STAGING_MODE=true` と `ATLASEZ_STAGING_CRON_MODE=intake-only` を確認してから応募受付の照合だけを実行します。staging mode欠落・誤値・別scheduleではCron全体を停止します。GitHub同期、公開処理、タスクリマインダー、Discord role同期、通知dispatchは呼びません。Resend dispatchはAPI経由も含め `ATLASEZ_STAGING_EMAIL_DELIVERY=test-sink` とCloudflare Secretの完全一致allowlistがある場合だけで、`disabled`時はqueueのdispatch自体をしません。送信元とテスト宛先のドメインは `atlasez.test`、`staging.example.test`、`staging.example.invalid` の完全一致だけを認め、宛先は加えてResendの正確な予約済みsimulator address（`delivered@resend.dev`、`bounced@resend.dev`、`complained@resend.dev`）を認めます。substring、任意の`.test`/`.invalid`、`staging`を含むだけの外部ドメインは拒否します。実際のsink宛先を追加する場合は、管理者が所有確認済みtest domain/addressを別途承認してからコードの明示allowlistを変更し、再レビューします。その他のqueue rowはproviderへ送信しません。本番モードにはこのstaging専用の宛先制約を適用しません。
- 設定検査はCloudflare/Google/Resend/Discordのsecret値を読みません。API keyがstaging用か、Resend sinkが実際にそのsynthetic addressを受けるか、Botが他guildへアクセスできないかは、サービス管理者のread-backと証跡が必要です。検査成功だけで実サービス隔離をPASSにしません。

## 2. ローカル隔離検証

```bash
npm ci
npm run test:admin-staging:isolated
```

このrunnerはCloudflare/Resend/Discord/OAuth credentials、live E2E target、保存済みauth stateが環境にある場合は起動を拒否します。対象テストは実Worker codeとSQLiteを使い、global `fetch`を拒否またはfake providerで置換します。実サービスへネットワーク接続しません。

`tests/fixtures/admin-staging-accounts.ts` の `@atlasez.test` identityはローカルDB専用です。STG-01のGoogleアカウントとして利用せず、Google Cloud管理者が別の管理下synthetic accountを用意してください。

`npm run verify:admin-staging-migration` は一時SQLiteファイルに対して次を実施し、終了後に作成物を削除します。

1. migration 0133までを適用し、synthetic応募・送信済み確認queue・運営通知queueを作成。
2. SQLite snapshotをとり、実際のmigration 0134を適用。
3. 通知先snapshot backfill、状態default、既存queue行数/送信済み状態を確認。
4. 0134以前の列だけを指定する旧Worker型INSERTが動くことを確認。
5. snapshotをrestoreし、0134列・ledger entryが戻り、元の応募/queueが残ることを確認。

この結果はlocal SQLite drillであり、Cloudflare D1のTime Travelやbackup/restoreを実証した証拠ではありません。

## 3. 管理されたstaging deploy

実Workerへ配信する前に、Cloudflare管理者が専用Worker/D1を作成し、設定とsecret名をread-backします。secret値をGit、Issue、shell historyへ記録しません。Workerには別用途のGitHub、公開サイト、production Discord、productionメールsecretを設定しません。staging D1の0134 ledgerが適用済みで、旧Worker互換性の確認が終わるまで新Workerは配信しません。

```bash
cp wrangler.admin.staging.example.jsonc wrangler.admin.staging.jsonc
# ローカルのignored configへstagingのresource/client IDとstaging originだけ記入
npm run verify:admin-staging-config
npm run deploy:admin:staging -- --dry-run
```

dry-runはAdmin向けartifactを作ってWrangler dry-runを行います。staging Worker/D1への書込みはありません。実際のstaging配信を担当者が承認して行う場合は、cleanなcommit済みworktreeで以下を使います。3つの確認値は、配信担当がstaging設定・provider secret名・0134 ledgerのread-backを終えた後にだけ設定します。

```bash
ATLASEZ_STAGING_DEPLOY_CONFIRMED=1 \
ATLASEZ_STAGING_PROVIDER_SETTINGS_VERIFIED=1 \
ATLASEZ_STAGING_0134_VERIFIED=1 \
npm run deploy:admin:staging -- --deploy
```

Resendのtest sinkを明示的に使う時だけ `ATLASEZ_STAGING_RESEND_SINK_CONFIRMED=1` も設定します。test-sink以外の宛先、または確認されていないAPI keyは配信しません。このdeploy scriptは固定のignored staging configしか読み込まず、本番の `wrangler.admin.jsonc` へfallbackせず、migrationは一切実行しません。Cloudflare D1 operatorが後続の専用手順で対象名を二名照合してmigrationを適用します。

## 4. Cloudflare管理者がstagingを用意する手順

### Cloudflare Account admin / D1 operator

1. staging Worker `atlasez-admin-staging` と専用D1 `atlasez-admin-staging-reports` を作成し、D1 IDを運営の安全な台帳へ記録します。同じCloudflare Accountを使う場合もWorkerとD1は本番と別資源にします。
2. `workers.dev` の専用URLを有効にし、`preview_urls=false` のままにします。この基盤はzone Custom Routeを使わないため、staging WorkerにWorkers Routes権限を付与しません。
3. Worker bindingは専用D1だけにします。`atlasez-reports`、本番の編集室Durable Object、production Queue、公開サイトbindingを追加しません。member intake以外の編集室画面は試験対象外です。
4. Staging secretsへ専用Google OAuth secret、Discord OAuth secret/暗号鍵、test guild専用Bot token、Resend test-sink API keyを個別登録します。`vars`へsecretを置かず、production secretを複製しません。WorkerにGitHub App/token、公開サイト連携、production webhook/token、Turnstile secretなど不要secretが存在しないことをsecret名だけでread-backします。
5. `wrangler.admin.staging.example.jsonc` をローカル専用設定にコピーし、Cloudflareから取得したstaging Account ID、D1 ID、workers.dev host、Google/Discord test ID、staging sender/sink addressだけを記入します。完成後に静的検査を実行し、値はIssueへ貼らず、resource名・末尾を除いた匿名識別子・検査時刻だけを記録します。

CloudflareのAccount adminは専用資源を作る権限、D1 operatorは専用D1 migration/read-back/Time Travelの権限、Worker deploy担当はstaging Workerのscript/settings write権限が必要です。本番Route権限は不要です。

### Google Cloud / Resend / Discord管理者

- **Google Cloud admin:** 専用OAuth clientを作り、Authorized JavaScript originをstaging `workers.dev` origin、redirect URIを `https://<staging-worker-host>/auth/google/callback` に限定します。synthetic Google accountだけをtest usersへ登録します。prod client secretを複製せず、client IDの匿名識別子・callback設定・test-account件数を記録します。
- **Resend owner:** test-sink用のproject/API keyとverified staging senderを確認し、承認されたsynthetic recipientだけをexact-address allowlistにします。現在コードで許可される宛先は上記の合成test domainとResend公式simulator addressのみです。別の実sink address/domainを使う場合は、所有確認と明示的なコードallowlist変更・レビューが完了するまでResendを無効に保ちます。Test recipientでsimulatorを使う場合も、queue登録・provider受理・sink側状態を別々に記録します。API key・recipient本文は証跡へ残しません。
- **Discord admin:** 別OAuth applicationとBotを作り、`https://<staging-worker-host>/auth/discord/callback` だけをredirect URIにします。Botをtest guildだけへinstallし、必要な最小権限とtest role hierarchyをread-backします。production guildへのinstallやproduction Bot token共有は禁止し、OPSD-08の承認前はgrant/revoke試験を開始しません。

設定担当はstaging host/Worker ID/D1 ID/Google client ID/Discord application・guild IDの一致、secret名とprovider projectの分離を二名で照合します。証跡は値を伏せた設定画面、read-only resource metadata、検査時刻、照合者roleで残します。Cloudflare accountを共用する場合も対象resource IDを必ず記録し、production D1/Route/Workerをstaging用として転用しません。

## 5. migration 0134の実staging試験

Cloudflare D1 Time Travelは現在のbookmarkをread-onlyで取得できます。restoreはそのD1の全状態を指定時点へ上書きする破壊的操作です。公式手順では `wrangler d1 time-travel info` でbookmarkを取得し、`wrangler d1 time-travel restore` で指定時点へ戻します。[Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)

専用staging D1だけを対象に、D1 operatorが次の順で実施します。

1. Cloudflare dashboard/WranglerでWorker名・D1名・完全なD1 IDを二名照合し、production IDでないことを確認します。対象の旧Worker build/SHA、D1 migration ledger、CI runを記録します。
2. `wrangler d1 info atlasez-admin-staging-reports --remote --config wrangler.admin.staging.jsonc` でD1 storage versionを確認します。Time Travelを使用できる状態であることを記録します。
3. `wrangler d1 time-travel info atlasez-admin-staging-reports --config wrangler.admin.staging.jsonc` でmigration前bookmarkを取得し、安全な運用記録に保存します。出力をIssueへ丸ごと貼らず、bookmarkは権限を持つ担当者間だけで共有します。
4. `wrangler d1 migrations list atlasez-admin-staging-reports --remote --config wrangler.admin.staging.jsonc` で新規D1のpending migration一覧と最終番号を確認します。新規D1では0134だけでなく全migrationがpendingであるのが想定です。途中migrationが一部適用済みなら作業を止め、状態を調査します。
5. 事前backup/bookmarkと専用D1を再確認し、承認されたD1 operatorが `wrangler d1 migrations apply atlasez-admin-staging-reports --remote --config wrangler.admin.staging.jsonc` を実行します。本番D1名やproduction configを指定しません。適用後、read-only migration listで0134を含む全migrationのledgerを確認します。
6. **旧migrationの固定運営者をstagingへ持ち込まないための初期role resetを、新規D1でOAuth account/試験データを追加する前に一度実施します。** Migration `0004`/`0090` は本番の全体管理者、`0079` は本番のproject leader、`0091` は本番管理者のDiscord除外を固定値でseedします。新規D1へ全migrationを適用するとこれらの行も作られます。ステージングD1 operatorは対象のD1名/IDを二名照合した後、次のSQLを `atlasez-admin-staging-reports` のみへ実行します。`<DEDICATED_STAGING_GOOGLE_OPERATOR_EMAIL>` はGoogle test userとして既に登録した専用合成アカウントの小文字メールへ置換し、実メンバーのメールは使いません。

   ```sql
   DELETE FROM report_admin_permissions;
   DELETE FROM editorial_workflow_roles;
   DELETE FROM atlasez_member_discord_role_sync_exclusions;
   INSERT OR IGNORE INTO report_admin_permissions (email, subject)
     VALUES ('<DEDICATED_STAGING_GOOGLE_OPERATOR_EMAIL>', '*');
   SELECT email, subject FROM report_admin_permissions;
   SELECT COUNT(*) AS count FROM editorial_workflow_roles;
   SELECT COUNT(*) AS count FROM atlasez_member_discord_role_sync_exclusions;
   ```

   Read-backで全体権限が専用staging operatorの1行だけ、他2表が0行であることを確認します。この初期化は新規staging D1限定で、後続の試験roleを作成した後に再実行しません。失敗/途中成功時はrole試験を開始せず、operatorが同じ初期化を再実行して上記状態を確認します。SQL結果やメールアドレスをIssueへ貼らず、匿名fixture key・row counts・実施者role・UTC時刻を記録します。

7. 0134後の旧Worker互換性は、migration前のADMIN main SHAをrelease ownerが固定し、そのSHAをtemporary worktreeへcheckoutしてCloudflareのstaging Workerだけへ一時配信して検証します。旧コードはstaging Cron markerを解釈しないため、旧Workerの配信前にDashboardでそのWorkerの全scheduled triggersを無効化し、配信後も0件であることをread-backします。`wrangler.admin.staging.compat.jsonc` は専用staging Worker/D1/originだけを含むローカル設定から `triggers` を削除して作成し、通常worktreeで `npm run verify:admin-staging-config:compat` を通した後、対象旧SHAのworktreeへコピーします。旧SHA側でAdmin build・build-infoを検証し、次のdry-runまでを行います。

   ```bash
   git worktree add --detach ../admin-staging-pre-0134 <PRE_0134_ADMIN_MAIN_SHA>
   cp wrangler.admin.staging.compat.jsonc ../admin-staging-pre-0134/wrangler.admin.staging.compat.jsonc
   cd ../admin-staging-pre-0134
   npm ci
   ATLASEZ_BUILD_TARGET=admin SITE_URL=https://<staging-worker-host> BASE_PATH=/ npm run build
   npm run verify:build-info
   npx wrangler deploy --dry-run --config wrangler.admin.staging.compat.jsonc --keep-vars
   ```

   Cloudflare staging operatorがWorker名・D1 ID・Cron 0件を二名確認した後だけ、同じdirectory/configで `npx wrangler deploy --config wrangler.admin.staging.compat.jsonc --keep-vars` を実行します。旧互換性の間はDiscord/Resend secretを外し、OAuth以外のprovider操作をしない専用アカウントで応募/queueの旧列書込み・読取りとrow countsだけを確認します。Cronが0件のread-backを残してから新Workerを通常のstage config/wrapperで配信し、guarded intake-only Cronを有効化します。旧コード、D1、Worker version、実施者、Cronの0件/1件read-backを証跡に記録します。

8. Time Travel restoreの実証は他のSTG dataが存在しない使い捨てD1で行います。migration前bookmarkへのrestore後に0134列/ledgerがなく、synthetic legacy rowsが保たれたことをread-only検証し、その後必要なら0134を再適用して最終ledgerを確認します。共有staging D1を無断でrestoreしません。

実行前にD1の `version` がTime Travelをサポートしない場合、backup手段とrestore権限が未確認の場合、migration listに0134以外の予期しない項目がある場合、backup/bookmarkが確認できない場合は停止します。適用失敗時はworker配信とCronを止め、migration SQL・D1 query error・ledgerを保存し、再applyやrestoreを推測で行わずD1 operatorへエスカレーションします。コードを戻す場合も0134の列/indexは残し、down migrationでschema/dataを削除しません。

上記のremote D1書込み・restore・staging deployは、本PRのCIやローカルrunnerでは実施しません。担当者の変更承認を得たstaging専用作業です。

## 6. STG-01〜09を開始する順序

`docs/ADMIN_MEMBER_INTAKE_STAGING_CHECKLIST.md` が正式な試験票です。次の順序で担当者が準備し、試験ごとに対象SHA/Worker Version、anonymous fixture key、UTC時刻、HTTP status、synthetic row counts、許可/拒否、証跡URLを記録します。メール本文、住所、Cookie、OAuth情報、Discord account名は記録しません。

ResendとDiscordを無効のままでも、STG-01〜06のWeb/API側検証は実施できます。STG-02では応募・運営task・メールqueueの状態を照合し、Resend dispatch/provider呼出しが0件であることを確認します。実配達はverified test sinkがread-backされるまでSTG-07へ分離します。STG-06では既存sessionからのサイトAPI拒否・membership/role状態を確認し、Discordのgrant/revokeはOPSD-08承認後のSTG-08に限ります。

最初の開始操作と担当は次の順です。これは作業手順であり、未実施のCloudflare/provider変更を実施済みとは扱いません。

1. **Staging owner / Cloudflare Account admin:** 専用Worker・D1を作成し、`wrangler.admin.staging.jsonc` をignored local configとして完成。`npm run verify:admin-staging-config` と `npm run deploy:admin:staging -- --dry-run` が通るまでdeployしません。Resource ID、worker.dev URL、binding/secret名だけを二名でread-backします。
2. **Google Cloud admin:** 専用OAuth clientにstaging worker.dev originと `/auth/google/callback` を登録し、運営が管理する合成Google test usersを用意します。アカウントのメール/secretはGitHubに記録せず、内部の権限台帳でfixture keyに対応付けます。
3. **D1 operator:** migration/backup手順に従い全migrationを専用D1だけへ適用し、上記のbootstrap SQLでmigrationに埋め込まれた本番role seedを除去してsynthetic global operatorだけを作成します。operatorがGoogle OAuthでログインでき、global route/APIにだけscopeを持つ read-only 確認が終わるまで他roleをseedしません。
4. **Cloudflare staging operator + release owner:** 0134後の旧Worker互換性試験を開始する時は、DashboardのScheduled Triggersを0件にし、専用worker.dev URL・D1だけのcompat configで固定したpre-0134 main SHAを一時配信します。試験APIとrow countsのread-backが終わったら同SHA/Versionを記録し、staging-only新Workerをguarded Cron付きの通常config/wrapperから配信します。Cronの0件化と後続の1件化をそれぞれread-backするまで次へ進みません。
5. **Staging owner + QA/role owner:** applicant/accepted/member/manager/coordinator/suspended/withdrawn用の合成Google accountsを管理台帳で各fixture keyへ割当てます。`@atlasez.test` fixtureはローカル専用なので実Google loginに流用しません。応募者と受入memberはUI/APIから作り、権限fixtureはglobal operatorでstaging API経由に作成します。直接SQL seedする場合は対象role・必要最小行・cleanupを別途レビューし、全API権限は付与しません。
6. **Release owner:** staging Worker deployとSTG-01 OAuth smokeを開始します。Resend/DiscordはOPSD-08を含む承認・test sink/guildのread-backが完了するまで無効のままとし、STG-02〜09はそれぞれ表の事前条件を満たしてから開始します。

したがって、現時点ではSTG-01から開始できません。最初に必要なのはCloudflare Account adminが隔離Worker/D1を作成し、Staging ownerが匿名化したresource metadataを揃えることです。Google/Resend/Discordの担当者はそのstaging hostnameが確定した後に専用client/sink/guildを紐付けます。

| STG                 | 開始前に必要なもの                                                    | 合格証拠                                                                                                     |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 01 Google OAuth     | 専用OAuth client、staging callback URI、管理下synthetic accounts      | state/nonce replay拒否、callback/logout/session失効の結果、Cookie属性。secret/codeなし。                     |
| 02 応募             | staging D1 0134、synthetic applicant accounts、Resend disabled        | 応募/task/queue row counts、保存後応答喪失/409本人status、multi-project結果、provider呼出し0。宛先は匿名化。 |
| 03 審査             | applicant/manager/global synthetic roles                              | 対象project GET/decisionのHTTP matrix、監査履歴・revision。別projectの403/404。                              |
| 04 複数所属         | 2 projectのsynthetic memberships                                      | project A保持、project Bだけ追加、各scopeのdirect API拒否証跡。                                              |
| 05 初期設定/task    | accepted-incomplete/member fixtures、synthetic calendar/task rows     | profile/portal/calendar/task状態、他人task拒否、375px/keyboard/axe証跡。                                     |
| 06 休止・退会・復帰 | suspended/withdrawn/returned fixtures、Discord disabled               | 失効前後同一sessionのAPI結果、他project membership不変、許可scopeの復帰。Discord外部操作なし。               |
| 07 Resend           | test-sink API key、verified staging sender、synthetic inbox allowlist | queue→provider accepted→sink receivedを別記録。allowlist外recipient fetch 0、retry/idempotency。             |
| 08 Discord          | test guild、test bot/user、明示承認済みrole policy                    | guild/user/role pseudonym、grant/revokeのprovider read-back、サイト権限との同期。                            |
| 09 障害/運用        | intake-only Cron、D1 operator、alert/primary+backup on-call           | failure injection、marker recovery、pending queue/alerts、stop/ack/drill記録。                               |

Resendの実送信を有効化する場合は、staging configの `ATLASEZ_STAGING_EMAIL_DELIVERY` を `test-sink` に変え、静的確認を `ATLASEZ_STAGING_RESEND_SINK_CONFIRMED=1 node scripts/verify-admin-staging-config.mjs --config wrangler.admin.staging.jsonc --allow-resend-test-sink` で通してから、Cloudflare Secret `ATLASEZ_STAGING_EMAIL_ALLOWLIST` にtest inboxだけを設定します。allowlistを登録できない、synthetic Google accountの送信先がsinkでない、Resend account/key scopeが確かめられない場合は試験を止めます。

## 7. 開始を阻害する確認事項

- Cloudflare Workers Buildsの現行Production branch/commands/build token/Routes permission/autodeployは、この開発用OAuthの読み取り権限では取得できません。main mergeを契機にproduction deployされる可能性があるため、確認完了まで対象PRをmainへmergeしません。
- local `npm run test:admin-staging:isolated` は専用stagingやGoogle/Resend/Discord実到達を証明しません。
- production D1 ledgerでは、統合検証用Wrangler configと0134を含むcheckoutからread-only照会したところ0134がpendingです。production migrationは適用していません。
- Cloudflare resource、Google Cloud OAuth client/account、Resend test-sink API key/verified sender、Discord test guild/Botが未提供です。OPSD-01〜09の運営承認もpendingです。
- Lighthouseのperformance assertionは既存CIで非blocking失敗を報告しています。別品質課題として扱い、staging readiness PASSには数えません。
