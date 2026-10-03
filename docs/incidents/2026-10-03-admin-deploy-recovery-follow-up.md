# ADMIN本番反映の復旧フォローアップ

2026-10-03 JST。原因調査は[ADMIN SHA不一致調査](2026-10-03-admin-sha-mismatch-investigation.md)を参照。この記録は復旧操作と自動経路の復帰作業を追記する。

## 確認した原因

Cloudflareのロール変更を示す証拠は得られていない。mainの変更が本番へ流れなくなった直接原因は、2026-09-29のPR #448でGitHub ActionsのADMIN deploy workflowが削除された一方、代替に想定されたCloudflare Workers Buildsの接続が成立していなかったこと。Cloudflareの設定・役割が変わらなくても、main pushで配信するGitHub側の経路を削除すれば更新は止まる。

過去のActions runを調べ、2026-09-27に同じCloudflare account/Workerへmain SHAからの自動配信が成功した記録を確認した。Cloudflare Buildsへの接続を再試行するのではなく、レビュー可能なGitHub Actions経路を復旧する方針とした。旧workflowはD1 migrationも実行していたため、その動作は再導入しない。

## 実サイトへの一回限りの復旧

本番の正本remote `admin/main` のcleanなworktreeから、承認済みのmain SHA `503b389b12475c2b20079ddebd77f193439b42d7` を使って緊急deployを実行した。

| 項目                  | 確認結果                                                                  |
| --------------------- | ------------------------------------------------------------------------- |
| URL / Worker          | `https://admin.atlasez.org` / `atlasez-admin`                             |
| Cloudflare Version    | `31b63b74-b814-47b9-9f9e-ea1becd47d6a`                                    |
| Production配信        | 100%                                                                      |
| 公開`build-info.json` | SHA `503b389b12475c2b20079ddebd77f193439b42d7`、target `admin`            |
| D1                    | migrationの適用なし。読み取り確認で`No migrations to apply`               |
| 認証済みChrome        | ポータル、カレンダー、運営タスク、マイページ、管理画面のページshellを確認 |

実行前後の記録は[Issue #407](https://github.com/Atlasez/Admin-Atlesez/issues/407)に残した（[実行前](https://github.com/Atlasez/Admin-Atlesez/issues/407#issuecomment-5960006305)、[実行後](https://github.com/Atlasez/Admin-Atlesez/issues/407#issuecomment-5960353343)）。これは一回限りの復旧であり、main pushからの継続配信復旧とは区別する。

Chrome確認では`GET /api/admin/portal`と`GET /api/admin/notifications`がWorker内例外で500となる別問題も観測した。ページshellの表示は動的データの読込成功を意味しない。D1 migrationの追加や本番データ変更は行っていない。request IDと調査状況はIssue #407に記録し、原因が特定されるまで本番migrationで推測対応しない。

### ポータル／通知のデータ読込エラー修正

全migrationを適用した隔離SQLiteで実際に両APIを実行し、`queryNotificationSource`が`no such column: comment`を返すことを再現した。通知元メタデータの固定種別`comment`等をSQLの引用文字列ではなく識別子として組み立てていたため、通知APIが例外になり、同じ通知読込を含む`/api/admin/portal`も500になっていた。`src/lib/admin-notification-features.ts`で固定種別をSQL文字列リテラルとして出力するよう修正し、ポータル／通知API双方を全migration適用済み隔離DBで呼び出す回帰テストを追加した。対象テスト10件と`npm run format:check`が通過。修正は本PRでレビュー・CI後に配信し、本番へ直接のfeature branch deployやD1変更は行わない。

## 自動経路の復旧案

このfollow-upのPRでは、`.github/workflows/deploy-admin-from-github.yml`を次の条件で復旧する。

- `main`へのpushを起点とするCI全体が成功した後だけ実行する。PR由来のCIや失敗したCIからは配信しない。
- `production` Environment承認を経て、対象Workerを`wrangler.admin.jsonc`で固定する。
- workflow内でADMINをbuildし、commit SHAを照合した成果物だけをdeploy jobへ渡す。
- deploy直前にmain SHAを再確認し、Cloudflare Versionが100%配信であることと公開`build-info.json`のSHAを検証する。
- D1 migrationを含めない。GitHub Actionsが作成する記録とIssue #407を継続確認する。

GitHub Secret `CLOUDFLARE_DEPLOY_API_TOKEN`はrepository scopeで存在するが、その値やCloudflare側のpermissionsは読んでいない。このworkflowではproduction Environment承認後に、Wrangler deployとVersion確認の2 stepだけに渡す。tokenが使えない、権限不足、SHA不一致、100%未満のいずれかなら配信失敗として停止する。secret valueをIssue、PR、ログへ複製しない。

## 検証

復旧案はローカルで`npm run verify:deploy-config`、`npm run check`、`npm run lint`、`npm test`、`npm run format:check`、ADMIN設定の`npm run build`、`npm run verify:build-info`、content/math検査、Wrangler dry-run、`git diff --check`を確認する。PRのCI・レビュー・main merge、本番workflow run、production承認、Version、build-info、Chromeの動的APIをそれぞれ別の完了条件として記録する。
