# Cloudflare本番展開の定期同期

## 目的

Cloudflare本番のDeployment・Version・配信割合・Source・作成時刻と公開
`build-info.json`を読み取り、GitHub `main`の監査記録と照合します。Cloudflareからコードを
正本として取り込まず、記録を本番コードの代わりにしません。

## 動作

`.github/workflows/cloudflare-deployment-sync.yml`が15分ごと、または手動起動で次を読み取ります。

- Worker `atlasez-admin`のProduction Deploymentと直近10件のDeployment
- Worker `atlasez01`のProduction Deploymentと直近10件のDeployment
- `https://admin.atlasez.org/build-info.json`
- `https://atlasez.org/build-info.json`

差分がある場合だけ、`ops/cloudflare-deployment-sync`ブランチへ監査記録をcommitし、
`main`向けの同期PRを作成または更新します。差分がなければPRを作成しません。
記録は[`docs/deployments/cloudflare-latest.json`](deployments/cloudflare-latest.json)です。

`.github/workflows/verify-admin-production.yml`はschedule（15分ごと）と
`workflow_dispatch`でのみ起動し、その時点の`main` SHAと公開ADMINの`build-info.json`を
読み取り照合します。ADMIN deploy workflowの完了には依存せず、GitHub `production`
Environmentの承認待ちも監視しません。main SHAが照合中に進んだ場合は最新SHAを読み直します。
Workers Buildsの反映遅延は最大15回、各60秒で待機し、照合できなければWorkflowを失敗させます。
Cloudflareへの書き込みやDeployはどちらのWorkflowも行いません。

## 必要なSecret

- GitHub Actions Secret `CLOUDFLARE_API_TOKEN`は対象AccountのWorkers Scripts Readだけを
  持つ読み取り専用Tokenです。Deploy、Versions Upload/Deploy、Routes、D1、Secretsの権限を
  付与しません。
- 同期PR作成に使う`GH_SYNC_TOKEN`は`Admin-Atlesez`だけを対象にしたFine-grained Tokenです。
  ContentsとPull requestsのRead and writeだけを持ち、有効期限を設定します。

Secret未設定、API取得失敗、Source不明、`build-info.json`欠落も監査結果として記録します。
コードの自動復元、自動Merge、自動Rollback、自動Promoteは行いません。

## 同期PRと本番配信の扱い

- 同期PRは通常のPR/CI手順で内容を確認します。GitHub `main`のrequired approving reviews設定は
  変更しません。
- 同期Workflow自体は読み取り専用です。ただし同期PRを`main`へmergeするとmainが進むため、
  接続済みWorkers BuildsがBuildを開始する場合があります。mergeをDeploy停止操作とみなさず、
  Build run、checkout SHA、固定Worker Version、配信率を通常どおり確認します。
- 公開`build-info.json`のSHAが対象main SHAに一致している場合でも、merge後のBuildが自動で
  省略されるとは仮定しません。Buildが走った場合はその成否と対象SHAを確認します。
- 同期PRが`docs/deployments/cloudflare-latest.json`だけを変更した場合、公開SHAが`main`の祖先で、
  両SHA間の変更がその監査JSONだけであることを読み取り検証できたときに限り、既存コード配信SHAを
  維持した状態として説明できます。ADMINの停止条件と照合手順は
  [ADMINデプロイ運用方針](ADMIN_DEPLOYMENT_POLICY.md)を参照してください。
- `build-info.json`とmainの不一致、比較不能、不正なSHA、Cloudflare VersionのSourceが`Unknown`または
  手動Uploadなら、同期済みと扱わずIssueで調査します。
- 本番DeployはGitHub `main`を唯一のソースにしたCloudflare Workers Buildsから行います。
  `.github/workflows/deploy-admin-from-github.yml`は検証専用で、本番Deployを行いません。

## 初回導入時

現在の本番VersionにGit SHAがない場合、最初の同期PRは「本番展開記録」として作成されます。
Cloudflareから完全なソースを復元できないVersionについて推測でコードを生成しません。
Workers Builds復旧Issue [#509](https://github.com/Atlasez/Admin-Atlesez/issues/509)の
解決と対象main SHA/固定Worker Version/build-info照合を確認するまで、ADMINの新しい配信成功とは
扱いません。
