# ADMIN専用stagingの実行基盤

作成日: 2026-11-03 JST / read-only状態更新: 2026-11-04 UTC
状態: **専用staging Worker/D1は存在し、migration一覧のread-only確認済み。実サービス受入は未実施。**

本書は [PR #547のADMIN新規メンバー受入チェックリスト](https://github.com/Atlasez/Admin-Atlesez/pull/547) と連携し、設定ガード、fixture、migration drillを定めます。Cloudflare設定変更、staging deploy/migration、Google/Resend/Discordの実接続は、このPRだけでは実行しません。

## 0. 既存stagingのread-only状態（2026-11-04）

- Cloudflare上に専用Worker `atlasez-admin-staging` と専用D1 binding `atlasez-admin-staging-reports` が既にあります。production Worker/D1とは別資源です。Workerは専用 `workers.dev` originを使い、read-backではCustom Routeとscheduled triggerはありません。**既存資源を再作成、削除、初期化しないでください。**
- 隔離統合候補のmigration一式（0134を含む）を指定した `wrangler d1 migrations list ... --remote` は `No migrations to apply!` を返しました（2026-11-04 read-only）。これは現在のmigrationディレクトリに対する適用状況であり、backup/restore、データ整合性、production D1の状態を証明しません。既存D1へmigration、role seed reset、restoreを行わないでください。
- staging Workerのdeployment read-backはVersion prefix `ef25f36d` が100%配信、Source `Unknown`、時刻 `2026-11-03 09:54 UTC`。同Workerの `build-info.json` はADMIN commit `a509d52b5ad766d5cd41ad438ddf0040c7c13daa`、ref `unknown`、target `admin`、builtAt `2026-11-03T09:53:59Z` を返しました。現在の#549 HEAD `20eb2a5610509a1dfcdec2357812eb438582e442` と統合候補はこのWorkerに配信されていません。Source `Unknown`のため、このVersionを検証可能なsource provenanceとは扱いません。
- staging D1には既存の運営者identityと試験データがあります。データを保持し、削除・初期化・復元をしません。Google Cloud ConsoleのOAuth origin/callback/test-user一覧は独立read-backできておらず、運営者と異なるsynthetic applicant/member・reviewer identityは未準備です。
- Resend/Discordはstaging設定上disabledです。provider呼出し数は直接計測していないため、0回とは主張しません。実利用試験は行っていません。
- 従ってCloudflare Worker/D1の作成は現在の開始条件ではありません。STG-01〜06は、独立Google identities、対象Worker buildのprovenanceとdeploy承認、role別live試験承認が揃うまでBLOCKEDです。read-back時刻以降に状態が変わっていれば、変更前に再確認します。

## 1. 隔離設定と検査

- `wrangler.admin.staging.example.jsonc` は意図的に無効なAccount ID、D1 ID、Google OAuth IDを含む雛形です。Discordはdisabledが既定で、Guild/Client IDを含みません。deployに使わないでください。
- ローカル設定は雛形を `wrangler.admin.staging.jsonc` へコピーして作成します。このファイルは `.gitignore` 対象です。secret値、synthetic recipient一覧、Cookie、OAuth state/code/tokenをGitへ追加しないでください。
- 0134以前のWorker互換性をCloudflare上で確認する場合は、通常設定を複製した `wrangler.admin.staging.compat.jsonc` から `triggers` を削除し、`npm run verify:admin-staging-config:compat` で検査します。これは旧Worker用の一時設定であり、staging WorkerのスケジュールもDashboardで無効化・read-backしてから使います。
- `npm run verify:admin-staging-config:template` は雛形に対し静的検査をします。実設定は `npm run verify:admin-staging-config` で確認します。
- 検査はWorker名を `atlasez-admin-staging`、D1名を `atlasez-admin-staging-reports`、`workers.dev` originのみ、Custom Routeなし、Preview URLなし、専用Google OAuth ID、test送信元/通知先に固定します。Discordは `ATLASEZ_STAGING_DISCORD_MODE=disabled` とし、Guild/Client IDは設定から省きます。STG-08を別途承認する場合だけ `test-guild` profileへ切り替え、専用test guild/client ID、staging/test表記のguild名、Bot token・OAuth secret・暗号鍵を検査し、承認・test guild read-back・secret名 read-backの3確認を必須にします。本番Worker、D1、route、production Discord ID、secrets in `vars`、production Cron群を拒否します。
- stagingの `*/5 * * * *` CronはWorker側でstaging `workers.dev` originまたはstaging変数を認識した場合に `ATLASEZ_STAGING_MODE=true` と `ATLASEZ_STAGING_CRON_MODE=intake-only` を確認してから応募受付の照合だけを実行します。staging mode欠落・誤値・別scheduleではCron全体を停止します。GitHub同期、公開処理、タスクリマインダー、Discord role同期、通知dispatchは呼びません。Resend dispatchはAPI経由も含め `ATLASEZ_STAGING_EMAIL_DELIVERY=test-sink` とCloudflare Secretの完全一致allowlistがある場合だけで、`disabled`時はqueueのdispatch自体をしません。送信元とテスト宛先のドメインは `atlasez.test`、`staging.example.test`、`staging.example.invalid` の完全一致だけを認め、宛先は加えてResendの正確な予約済みsimulator address（`delivered@resend.dev`、`bounced@resend.dev`、`complained@resend.dev`）を認めます。substring、任意の`.test`/`.invalid`、`staging`を含むだけの外部ドメインは拒否します。実際のsink宛先を追加する場合は、管理者が所有確認済みtest domain/addressを別途承認してからコードの明示allowlistを変更し、再レビューします。その他のqueue rowはproviderへ送信しません。本番モードにはこのstaging専用の宛先制約を適用しません。
- Discord disabled profileではDiscord ID・secretを設定しません。関連OAuth/APIはHTTP 503 `staging_discord_disabled` でfail closedし、queue処理を含めDiscord providerを呼びません。STG-08のtest-guild opt-inが不完全なら同様に無効です。
- 設定検査はCloudflare/Google/Resend/Discordのsecret値を読みません。Google OAuth secretのstaging専用性、Resend sinkの所有、Discord Botがtest guild以外へアクセスできないことは、サービス管理者のread-backと証跡が必要です。Discord disabled profileはGuild/Client IDやsecretの有無を要求しません。検査成功だけで実サービス隔離をPASSにしません。

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

現在は既存Worker/D1を再利用します。read-onlyのbinding・route・secret名・migration確認を行い、専用の実行承認なしに設定変更やdeployをしません。DiscordとResendは無効のまま、STG-01〜06に不要なsecretを登録しません。secret値をGit、Issue、shell historyへ記録しません。Workerには別用途のGitHub、公開サイト、本番Discord、本番メールsecretを設定しません。現在のD1に0134を含む未適用migrationはread-back上ありませんが、これは旧Worker互換性や復元試験の証拠ではありません。対象Worker buildの由来とstaging deploy承認が確認できるまで配信しません。

```bash
cp wrangler.admin.staging.example.jsonc wrangler.admin.staging.compat.jsonc
# ignored configからtriggersを削除し、read-back済みstaging resource/client IDとoriginを設定
npm run verify:admin-staging-config:compat
npm run deploy:admin:staging -- --dry-run --no-cron
```

現在のstaging WorkerにはCron triggerがなく、Cloudflareのquotaも満杯です。既存Cronを変更せず応募・認可APIを実証する配信は `--no-cron` モードに限定します。このモードではscheduled処理を実行しないため、Cron・queue処理の実証はPASSにできません。Cronありの通常configは、承認済み容量の使い捨て環境でのみ使用します。

dry-runはAdmin向けartifactを作って対象configでWrangler dry-runを行います。Worker配信・D1 migration/writeはありません。実際のstaging配信は、Cloudflare担当の個別承認後、対象Worker/D1、provider設定、0134 ledgerを再read-backし、cleanなcommit済みworktreeから行います。`ATLASEZ_STAGING_DEPLOY_SHA`はレビュー・承認された40文字のcommit SHAをリテラルで指定し、実行時のHEADと一致しなければscriptが停止します。

```bash
ATLASEZ_STAGING_DEPLOY_SHA=<reviewed-40-character-commit-sha> \
ATLASEZ_STAGING_DEPLOY_CONFIRMED=1 \
ATLASEZ_STAGING_PROVIDER_SETTINGS_VERIFIED=1 \
ATLASEZ_STAGING_0134_VERIFIED=1 \
ATLASEZ_STAGING_NO_CRON_CONFIRMED=1 \
npm run deploy:admin:staging -- --deploy --no-cron
```

`--no-cron`は `wrangler.admin.staging.compat.jsonc` だけを読み、Cronなしを明示確認し、Cronを配信対象へ追加しません。

Resendのtest sinkを明示的に使う時だけ `ATLASEZ_STAGING_RESEND_SINK_CONFIRMED=1` も設定します。test-sink以外の宛先、または確認されていないAPI keyは配信しません。このdeploy scriptは固定のignored staging configしか読み込まず、本番の `wrangler.admin.jsonc` へfallbackせず、migrationは一切実行しません。Cloudflare D1 operatorが後続の専用手順で対象名を二名照合してmigrationを適用します。

## 4. Cloudflare管理者による既存stagingのread-back

### Cloudflare Account admin / D1 operator

1. Dashboardまたは限定read-only APIで既存Worker `atlasez-admin-staging`、専用 `workers.dev` origin、D1 binding `atlasez-admin-staging-reports`、Worker/D1 IDを照合します。production Worker/D1と一致せず、別のWorker/API/routeへ接続しないことを確認します。**存在しない場合や差異がある場合は、作成・変更せず、権限者の個別変更承認を待ちます。**
2. `preview_urls=false`、Custom Routeなし、scheduled triggers 0件、Worker bindingが専用D1だけであることをread-backします。`atlasez-reports`、編集室Durable Object、production Queue、公開サイトbindingがあれば停止し、是正承認を得ます。既存Cron枠を削除・追加・変更しません。
3. `wrangler d1 migrations list atlasez-admin-staging-reports --remote --config wrangler.admin.staging.jsonc` をread-onlyで照合します。2026-11-04の確認では、候補のmigration一式に対してpendingなしでした。対象の現在値と異なる結果が出た場合は、apply/reset/restoreせずD1 operatorへ調査依頼します。
4. secret **名**とvars名だけをread-backします。値は表示・記録しません。Google専用clientの既存設定があればその利用可否をGoogle Cloud管理者がread-backします。未確認・未作成なら既存clientの有無を先に調べ、重複作成や設定変更はGoogle管理者の個別承認後だけ行います。Resendはsink確認まで、DiscordはSTG-08のOPSD-08承認まで無効を維持します。production secretsを複製しません。
5. ignored local configは既存資源のread-back値と照合するためだけに使います。設定が現状と一致しない場合は、現在のWorkerを変更したり別resourceへdeployしたりせず停止します。検査結果はresource名・値を伏せた匿名識別子・確認時刻だけで記録し、ID・host・secret valueをIssueへ貼りません。

CloudflareのAccount adminは専用資源を作る権限、D1 operatorは専用D1 migration/read-back/Time Travelの権限、Worker deploy担当はstaging Workerのscript/settings write権限が必要です。本番Route権限は不要です。

### Google Cloud / Resend / Discord管理者

- **Google Cloud admin:** 専用OAuth clientを作り、Authorized JavaScript originをstaging `workers.dev` origin、redirect URIを `https://<staging-worker-host>/auth/google/callback` に限定します。synthetic Google accountだけをtest usersへ登録します。prod client secretを複製せず、client IDの匿名識別子・callback設定・test-account件数を記録します。
- **Resend owner:** test-sink用のproject/API keyとverified staging senderを確認し、承認されたsynthetic recipientだけをexact-address allowlistにします。現在コードで許可される宛先は上記の合成test domainとResend公式simulator addressのみです。別の実sink address/domainを使う場合は、所有確認と明示的なコードallowlist変更・レビューが完了するまでResendを無効に保ちます。Test recipientでsimulatorを使う場合も、queue登録・provider受理・sink側状態を別々に記録します。API key・recipient本文は証跡へ残しません。
- **Discord admin（STG-08のみ）:** OPSD-08で休止・退会・復帰時のrole方針が承認されるまではDiscord profileをdisabledのままにし、Client/Guild IDやsecretをstagingへ登録しません。有効化する場合は別OAuth applicationとBotを作り、`https://<staging-worker-host>/auth/discord/callback` だけをredirect URIにします。Botをtest guildだけへinstallし、必要な最小権限とtest role hierarchyをread-backします。Cloudflare configを `test-guild` / approval `true`へ変更するのは、最終role方針・test guild/client identity・secret名を照合した後だけです。production guildへのinstallやproduction Bot token共有は禁止します。

設定担当はstaging host/Worker ID/D1 ID/Google client IDの一致、secret名とprovider projectの分離を二名で照合します。Discordを後から有効にする場合だけ、test application/guild IDと承認済みrole policyも二名照合します。証跡は値を伏せた設定画面、read-only resource metadata、検査時刻、照合者roleで残します。Cloudflare accountを共用する場合も対象resource IDを必ず記録し、production D1/Route/Workerをstaging用として転用しません。

## 5. migration 0134の実staging試験

**現在のstaging D1は既存の運営者identity・試験データを含みます。この節の「空の新規D1」「全migration apply」「role seed reset」「restore」は、別途承認された使い捨てD1演習専用です。既存の `atlasez-admin-staging-reports` には実行しません。** 2026-11-04のread-only migration listでは現在のmigration一式（0134を含む）にpendingなしでした。既存stagingを空にする・作り直す・旧snapshotへ戻す操作は禁止です。

Cloudflare D1 Time Travelは現在のbookmarkをread-onlyで取得できます。restoreはそのD1の全状態を指定時点へ上書きする破壊的操作です。公式手順では `wrangler d1 time-travel info` でbookmarkを取得し、`wrangler d1 time-travel restore` で指定時点へ戻します。[Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)

専用staging D1だけを対象に、D1 operatorが次の順で実施します。

1. Cloudflare dashboard/WranglerでWorker名・D1名・完全なD1 IDを二名照合し、production IDでないことを確認します。対象の旧Worker build/SHA、D1 migration ledger、CI runを記録します。
2. `wrangler d1 info atlasez-admin-staging-reports --remote --config wrangler.admin.staging.jsonc` でD1 storage versionを確認します。Time Travelを使用できる状態であることを記録します。
3. `wrangler d1 time-travel info atlasez-admin-staging-reports --config wrangler.admin.staging.jsonc` でmigration前bookmarkを取得し、安全な運用記録に保存します。出力をIssueへ丸ごと貼らず、bookmarkは権限を持つ担当者間だけで共有します。
4. **使い捨てD1演習の場合のみ** migration一覧を確認します。新規D1では0134だけでなく全migrationがpendingであるのが想定です。部分適用なら作業を止めます。既存staging D1では前節のread-only照合結果を使い、migration applyをしません。
5. **使い捨てD1演習に対する個別D1変更承認がある場合のみ**、事前backup/bookmarkと専用D1を再確認し、承認されたD1 operatorがmigration applyを実行します。本番D1名やproduction configを指定しません。適用後、read-only migration listで0134を含む全migrationのledgerを確認します。既存staging D1へはapplyしません。
6. **初期role resetは、新規の使い捨てD1演習だけに適用します。既存staging D1へ次のDELETE/INSERT SQLを実行してはいけません。** 既存stagingには運営者identityと試験データが保存されています。migration `0004`/`0090`、`0079`、`0091` の固定seed除去が必要な新規D1演習では、演習用D1を二名照合してから、個別承認済み手順として次のSQLを使用します。

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

7. 0134後の旧Worker互換性を実Cloudflareで調べる場合は、共有中のstaging Workerを旧SHAで置き換えるため、staging-onlyのdeploy承認・停止条件・復帰手順が別途必要です。承認前はworktree、build、dry-runまでに留め、既存Workerへ配信しません。旧コードはstaging Cron markerを解釈しないため、承認済み演習ではCron 0件をread-backしてから実施します。既存stagingのCronを無断で変更・削除しません。

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

次の順で既存資源をread-backします。これは作業手順であり、未実施のCloudflare/provider変更を実施済みとは扱いません。

1. **Staging owner / Cloudflare Account admin:** 既存Worker/D1、ID、origin、binding、route、Cron状態をread-onlyで確認し、匿名化して記録します。現在確認済みの資源を再作成しません。`wrangler.admin.staging.jsonc`を実際のread-back値と比較し、不一致ならstopします。
2. **Google Cloud admin:** 既存専用OAuth clientのorigin/callback、test-user一覧をread-backします。既存clientが無い場合に限り、Google adminの個別承認後に新規作成します。運営者と異なるsynthetic applicant/memberとproject reviewerをそれぞれ用意し、メール/secretはGitHubに記録せずfixture keyだけを内部台帳へ対応付けます。
3. **D1 operator:** 既存staging D1ではmigration一覧をread-only確認するだけです。現在は0134を含むcandidate migration一覧にpendingなしと確認済みです。既存identity/試験データがあるためbootstrap SQL、再seed、clear、apply、restoreをしません。global operatorの画面/API確認をsynthetic applicant/reviewerの結果と混同しません。
4. **Cloudflare staging operator + release owner:** 実stagingで旧Worker互換性を検証する前に、既存Workerを置き換えるstaging-only実行承認、対象SHA、backup/復旧・停止手順を確認します。approvalがない間はcompat configのverify/build/dry-runまでにし、Worker、Cron、D1に変更を加えません。実施が承認された場合もCron状態変更は別途個別承認が必要です。
5. **Staging owner + QA/role owner:** applicant/accepted/member/manager/coordinator/suspended/withdrawn用の合成Google accountsを管理台帳で各fixture keyへ割当てます。`@atlasez.test` fixtureはローカル専用なので実Google loginに流用しません。応募者と受入memberはUI/APIから作り、権限fixtureはglobal operatorでstaging API経由に作成します。直接SQL seedする場合は対象role・必要最小行・cleanupを別途レビューし、全API権限は付与しません。
6. **Release owner:** 現Workerのprovenanceと、候補SHAをstagingへ配信する個別承認が揃ってからSTG-01 OAuth smokeを開始します。現時点のWorker build-infoは#549 HEADより古く`ref=unknown`で、distinct synthetic identitiesもないため、まだ開始しません。Resend/Discordはsink/guild・承認が揃うまで無効のままとし、STG-02〜09は各表の前提条件を満たしてから開始します。

したがって、現時点ではSTG-01から開始できません。Worker/D1作成は不要で、再作成や初期化をしてはいけません。次に必要なのはGoogle Cloud adminによる既存OAuth設定のread-backと、別identityの合成applicant/member・project reviewerの準備、およびrelease ownerによる対象staging build配信の個別承認です。これらが完了するまで実OAuth・staging write・deployは行いません。

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

STG-01〜06を実施する間は、Discord configを `disabled` / policy `false` のままにし、Discord IDs/secretsを登録しません。STG-08はOPSD-08の承認とtest guild/client/secret-name read-back後に限り、専用configを `test-guild` / policy `true` に変更して、次の確認を先に通します。production Discord IDは検査で拒否されます。

```bash
ATLASEZ_STAGING_DISCORD_POLICY_CONFIRMED=1 \
ATLASEZ_STAGING_DISCORD_TEST_GUILD_VERIFIED=1 \
ATLASEZ_STAGING_DISCORD_SECRETS_VERIFIED=1 \
npm run verify:admin-staging-config -- --allow-discord-test-guild
```

この検査はsecret値を読みません。Cloudflare secret名のread-backと値の投入は権限を持つ管理者が個別に行います。検査失敗、未承認、または読み取り確認が欠ける場合、Discord OAuth/APIはstagingで引き続き503拒否しproviderを呼びません。通常のSTG-01〜06にこのDiscord opt-inは不要です。

## 7. 開始を阻害する確認事項

- Cloudflare Workers Buildsの現行Production branch/commands/build token/Routes permission/autodeployは、この開発用OAuthの読み取り権限では取得できません。main mergeを契機にproduction deployされる可能性があるため、確認完了まで対象PRをmainへmergeしません。
- local `npm run test:admin-staging:isolated` は専用stagingやGoogle/Resend/Discord実到達を証明しません。
- production D1 ledgerでは、統合検証用Wrangler configと0134を含むcheckoutからread-only照会したところ0134がpendingです。production migrationは適用していません。
- Cloudflare resource、Google Cloud OAuth client/account、Resend test-sink API key/verified sender、Discord test guild/Botが未提供です。OPSD-01〜09の運営承認もpendingです。
- Lighthouseのperformance assertionは既存CIで非blocking失敗を報告しています。別品質課題として扱い、staging readiness PASSには数えません。
