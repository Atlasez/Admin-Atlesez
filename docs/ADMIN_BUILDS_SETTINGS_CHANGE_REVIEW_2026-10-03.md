# ADMIN Workers Builds接続設定の変更レビュー

追跡: [Issue #407](https://github.com/Atlasez/Admin-Atlesez/issues/407)。固定値は[`ADMIN_DEPLOYMENT_POLICY.md`](ADMIN_DEPLOYMENT_POLICY.md)に従う。この文書はCloudflareの変更前レビュー記録であり、設定保存やトークン作成の実施記録ではない。

## 変更対象と設定値

- Cloudflare Account: `812021e62fa20465950b61be55dfe064`
- Worker: `atlasez-admin`
- 本番URL: `https://admin.atlasez.org`
- GitHub: `Atlasez/Admin-Atlesez`, production branch `main`
- Root directory: `/`
- Build: `npm ci && ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ npm run build`
- Deploy: `npx wrangler deploy --config wrangler.admin.jsonc --keep-vars`
- Preview builds: disabled
- Build cache: disabled

接続画面の初期値はBuild `npm run build`、Deploy `npx wrangler deploy`、Preview有効であり、固定値と異なる。これらを上記の値へ直さず保存しない。

## 接続に必要な認証と影響

2026-10-03の固定AccountのDashboard接続画面では、既存tokenは候補に表示されず「Create new token」のみを選択できた。自動作成のtoken権限は次のとおりと画面に表示される。

- Account: Account Settings read、Workers Scripts edit、KV edit、R2 edit、D1 edit、Vectorize edit、Queues edit、Basin Pipelines edit、Containers edit、Cloudchamber edit、Connectivity Directory read/bind、AI Search edit
- Account内の全Zone: Workers Routes edit
- User: User Details read、Memberships read

これは`atlasez-admin`だけに限定されない。Cloudflare Account内の他Worker、D1/KV/R2等のデータ、全ZoneのWorker Routeやサービスに影響しうるユーザーtokenであり、最小権限ではない。トークンはCloudflareのWorkers Builds連携用として保管され、権限を持つGitHub `main`の変更に応じた本番Build/Deployを可能にする。Cloudflareの接続確定後にBuildが開始され、現在のproduction branch `main`を本番WorkerへDeployする可能性がある。

Cloudflareの現行UIにBuildsから使える個別Worker scope tokenは現れなかった。したがってこの広い自動tokenを作成して接続する場合は、通常のleast-privilege案を外れる例外である。設定を保存する直前に、上記権限、GitHub接続、mainから本番Build/Deployが始まりうる点を明示して、実行者の具体的な最終確認を得る。

## 事前条件と確認

送信直前に、GitHub `main`の40桁HEAD SHAと、そのSHAの必須CIが成功していることを記録する。本番`build-info.json`は現在 `74084dc6147490fef228b6a1f68ae3fedae79ba7` / `ref: unknown` で、GitHub `main`との不一致が継続している。古い本番状態を安全に保ったまま監視し、Buildが別SHA・未成功CI・Worker名不一致を対象にした場合は、次の操作を停止する。

接続前に接続フォームを次の値に直し、再読して一致を確認する。

```text
Git repository: Atlasez/Admin-Atlesez
Production branch: main
Root directory: /
Build: npm ci && ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ npm run build
Deploy: npx wrangler deploy --config wrangler.admin.jsonc --keep-vars
Preview builds: disabled
Build cache: disabled
```

接続直後はBuildログ、commit SHA、Worker名、Cloudflare Version ID、100%配信、公開`build-info.json`を照合する。認証済みChromeで`/admin/portal/`、`/admin/member-tasks/`、`/admin/member-calendar/`、`/admin/member-profile/`、`/admin/manage/?project=atlas`、`/admin/articles/`も確認する。すべての証拠が揃うまで本番復旧完了としない。

## 復旧方法

- Build設定が固定値と違う、またはPreviewが有効になっていた場合、追加のDeployや別経路のDeployを止める。Cloudflare接続を一時停止して再発火を防ぎ、正しい値をレビューした後にだけ再開する。
- Worker名、SHA、Version、配信率、主要Chrome画面に異常があれば、その時点の証跡を保持して停止し、Issue #407に記録する。推測でrollback、promote、Route変更、cache purge、D1操作をしない。
- アプリ不具合は修正PRをレビュー・CI成功後に`main`へ反映してWorkers Buildsから修復Deployする。接続設定が原因なら、設定変更用PRのレビュー後に接続を止めるか修正する。
- 自動作成tokenはWorkers BuildsのためCloudflareに保管される。接続を切る場合はDeploy停止を確認してからCloudflare UIで接続を解除し、そのtokenを失効させる。共有中の別サービスを切らないよう、失効対象のtoken名・参照先を照合してから操作する。

## 現在の状態

本レビュー時点で、token作成、GitHub認可、接続保存、Build開始、Worker/D1/Route/Version変更は行っていない。

## 2026-10-13 追加レビュー: 本番Deployに必要なRoute権限

### 確認した状態

- Cloudflare Dashboardでは、Worker `atlasez-admin`、GitHub `Atlasez/Admin-Atlesez`、production branch `main` のWorkers Builds接続が稼働している。
- Build token欄には `Atlasez ADMIN Builds Deploy` と表示されている。
- main SHA `e63ab8b8ecca0dbe042e982fc19e9c3dffc7e370` のBuildはBuild commandを完了した後、Deploy commandでWorkerをアップロードし、`/zones/f9dc11b6714d2c431f7c9ce9187a98df/workers/routes` のAPIから `No access to the specified resource` を返されて失敗した。
- `wrangler.admin.jsonc` のCustom Domainは `admin.atlasez.org`、Zoneは `atlasez.org`。Cloudflareの案内では、RouteまたはCustom DomainをDeploy時に追加・更新・削除するにはWorkerのEditor権限と、対象Zoneの `Workers Routes Write` が必要。
- 失敗後のDeployment/Version一覧では、既存Version `d4387787-e85e-4de4-8973-5795bd634149` が引き続き100%配信され、新しいVersionは確認されなかった。公開 `build-info.json` もmainの上記SHAを示している。

### 提案する設定値と影響

- 対象token: Cloudflare Workers BuildsのBuild token欄で利用中の `Atlasez ADMIN Builds Deploy`。変更前にDashboardでtokenの識別情報とWorkers Buildsからの参照を照合する。
- 追加する権限: `Zone > Workers Routes > Write`。
- Resource scope: Account `812021e62fa20465950b61be55dfe064` 内のZone `atlasez.org` のみに限定する。他のZoneやAccountへ広げない。
- 目的: `atlasez-admin` の既存 `admin.atlasez.org` Custom Domainを含む、`wrangler.admin.jsonc` に基づくWorkers Builds Deployを完了させる。
- 影響範囲: このZone-scoped権限は `atlasez-admin` だけには限定されず、`atlasez.org` Zone内のWorker RoutesやCustom Domainの追加・更新・削除を行える。Zone内の他ホスト名のWorker接続にも影響しうる。アカウント内の他ZoneのRoute権限は追加しない。
- 変更前確認: 対象tokenのWorker Editor/Worker Scripts権限、Zone名、tokenのBuilds参照先を読み取り専用で照合する。現在の既存Custom Domain Route、Worker名、公開build-info SHAを記録する。

### 復旧方法

1. Deploy後にWorker `atlasez-admin`、Version ID、100%配信、公開build-info SHA、認証済みChromeの主要ADMIN画面を確認する。
2. Routeの誤変更、想定外のWorker/Version、配信率の異常があれば、それ以上のBuild/Deploy操作を止める。推測でRouteやVersionを変更・rollbackしない。
3. 追加権限が原因と確認でき、復旧Deployが不要な場合は、参照先を照合した同じBuild tokenから `atlasez.org` の `Workers Routes Write` だけを外し、既存のCustom DomainとWorker配信を読み取り専用で再確認する。Build tokenそのものを失効・再作成しない。
4. tokenがCloudflare側で編集不能な管理tokenと判明した場合は変更を止め、代替接続方式と必要な権限を別途レビューする。Account内の全Zoneへ一括でRoute権限を広げない。

### 承認前の停止事項

これは本番Zone上のRoute/Custom Domainを変更できる権限の追加である。PRで設定値・影響・復旧方法をレビューし、実行者がCloudflare Dashboardで上記の対象tokenとZone scopeを再照合した後にだけ変更する。この追記時点ではWorkers Buildsのtoken、Worker、Route、Version、本番配信を変更していない。
