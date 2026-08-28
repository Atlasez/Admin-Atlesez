# Cloudflare本番展開の定期同期

## 目的

Cloudflare本番がGitHub `main`と一致しているかを、定期的にGitHub上で確認できるようにする。Cloudflareからコードを正本として取り込むのではなく、Deployment・Version・配信割合・Source・作成時刻・公開`build-info.json`を監査記録として同期する。

## 動作

`.github/workflows/cloudflare-deployment-sync.yml`が15分ごと、または手動起動で次を読み取る。

- `atlasez-admin`のProduction Deploymentと直近10件のDeployment
- `atlasez01`のProduction Deploymentと直近10件のDeployment
- `https://admin.atlasez.org/build-info.json`
- `https://atlasez.org/build-info.json`

差分がある場合だけ、`ops/cloudflare-deployment-sync`ブランチへ記録をCommitし、`main`向けの同期PRを作成または更新する。差分がない場合はPRを作成しない。

記録ファイルは[`docs/deployments/cloudflare-latest.json`](deployments/cloudflare-latest.json)である。これは本番コードの正本ではなく、CloudflareとGitHubの状態を突き合わせる証跡である。

## 必要なSecret

GitHub Actions Secret `CLOUDFLARE_API_TOKEN`を設定する。Tokenは対象AccountのWorkers Scripts Readだけを持つ読み取り専用Tokenとし、Deploy、Versions Upload、Versions Deploy、Routes、D1、Secretsの権限を付与しない。

同期PRを作成するため、`GH_SYNC_TOKEN`も設定する。これは`Admin-Atlesez`だけを対象にしたFine-grained Tokenで、ContentsとPull requestsのRead and writeだけを持つ。組織全体のActions権限を変更する代替として使用し、他のリポジトリやCloudflare APIにはアクセスできない。有効期限は必ず設定し、期限前に同じ最小権限でローテーションする。

Secretが未設定、API取得失敗、Source不明、`build-info.json`欠落の場合も、記録にはその状態を残す。コードの自動復元、自動Merge、自動Rollback、自動Promoteは行わない。

## PRの扱い

- 同期PRは必ずレビューする。
- `build-info.json.commit`とGitHub `main`のSHAが一致しない場合はインシデントとして扱う。
- Cloudflare VersionのSourceが`Unknown`または手動Uploadの場合は、コード同期済みとみなさない。
- 同期PRのMergeは記録をGitHubに残すためのものであり、CloudflareへのDeployを意味しない。
- 本番Deployはレビュー済みのGitHub `main`を唯一の入口とする。

## 初回導入時

現在の本番VersionにGit SHAがない場合、最初のPRは「本番展開記録」として作成される。Cloudflareから完全なソースを復元できないVersionについて、推測でコードを生成してはならない。現行本番の変更をGitHubへ反映する必要がある場合は、別途、実コードを確認した同期PRを作成する。
