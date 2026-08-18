# 運営Workerのデプロイ（DEPLOYMENT_ADMIN_WORKER）

運営Worker `atlasez-admin` は **Cloudflare Workers Builds** でGitHubリポジトリ
`mitukx/atlasez-admin` と連携してデプロイします。Workers BuildsはWorkerに特化した
CI/CD機構で、Cloudflare Pagesとは異なり、D1、Cron、カスタムドメイン、
Secretバインディングなど既存Workerのすべての機能を保ったまま自動デプロイできます。

---

## 1. Workers BuildsとCloudflare Pagesの違い

| 項目                 | Cloudflare Pages                       | **Cloudflare Workers Builds（本Worker）** |
| -------------------- | -------------------------------------- | ----------------------------------------- |
| 用途                 | 静的サイト + Functions（簡易Worker）   | Worker専用（D1、Cron、カスタムロジック）  |
| 本番ブランチ         | main                                   | main                                      |
| 本番デプロイ         | 自動ビルド                             | `wrangler deploy`                         |
| 非本番ブランチ       | 自動プレビューURL                      | `wrangler versions upload` でPreview URL  |
| D1バインディング     | 制限あり                               | フルサポート                              |
| Cronトリガー         | 非対応                                 | 対応                                      |
| カスタムドメイン     | 対応                                   | 対応                                      |
| Secret環境変数       | ダッシュボードで設定                   | `wrangler secret put`                     |
| 既存Workerからの移行 | Worker機能が完全に再現できない場合あり | 既存Worker構成をそのまま維持              |

このリポジトリでは、学習サイト（`/atlas/`）はCloudflare Pagesで配信し、
運営Worker（`/admin/`）はWorkers Buildsで配信します。

---

## 2. Workers Buildsの設定

Workers & Pages → atlasez-admin → Settings → Builds

### GitHub連携を有効にする

1. **Settings → Builds → GitHub repository** で `mitukx/atlasez-admin` を接続
2. GitHub App `Cloudflare Workers` の初回認可が必要な場合は、ブラウザで承認
3. Production branch: `main`
4. Enable builds on branches: `All branches` （非本番ブランチのPreview URLを有効化）

### ビルドコマンド

| 項目                   | 値                                                           |
| ---------------------- | ------------------------------------------------------------ |
| Build command          | `npm run build`                                              |
| Deploy command         | `npx wrangler deploy --config wrangler.admin.jsonc`          |
| Preview deploy command | `npx wrangler versions upload --config wrangler.admin.jsonc` |
| Root directory         | `/` （リポジトリ直下）                                       |
| Node version           | `.nvmrc` (22)                                                |

### 環境変数とSecret

Secretは **`wrangler secret put`** で設定します。Workers BuildsのダッシュボードUI
では参照のみ可能で、GitHubリポジトリのSecretsからは読み込まれません。

```bash
# Secretの設定（本番Worker用）
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET --config wrangler.admin.jsonc
npx wrangler secret put GITHUB_PUBLISH_TOKEN --config wrangler.admin.jsonc
npx wrangler secret put DISCORD_ATLAS_WEBHOOK_URL --config wrangler.admin.jsonc
npx wrangler secret put DISCORD_PROGRESS_WEBHOOK_URL --config wrangler.admin.jsonc
npx wrangler secret put DISCORD_BOT_TOKEN --config wrangler.admin.jsonc
```

通常の環境変数（公開しても良い値）は `wrangler.admin.jsonc` の `vars` に記述済み:

```jsonc
{
  "vars": {
    "ADMIN_AUTH_MODE": "google-oauth",
    "ADMIN_PUBLIC_ORIGIN": "https://atlasez-admin.ukyoukay0.workers.dev",
  },
}
```

---

## 3. Preview URL（非本番ブランチの自動デプロイ）

Workers Buildsでは、`main` 以外のブランチをpushすると **Preview URL** が自動生成されます。
この機能を有効にするには、`wrangler.admin.jsonc` に次を追加します（既に追加済み）:

```jsonc
{
  "preview_urls": true,
}
```

### Preview URLの形式

| pushしたもの       | 生成されるURL                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `main`             | 本番 `https://atlasez-admin.ukyoukay0.workers.dev`                                                         |
| 非本番ブランチ     | `https://<ブランチ名>.atlasez-admin.ukyoukay0.workers.dev`                                                 |
| 同ブランチの再push | ブランチURLが最新に差し替わる。過去分も `https://<commit-hash>.atlasez-admin.ukyoukay0.workers.dev` で残る |

### GitHub PRへの自動コメント

GitHub App `Cloudflare Workers` がリポジトリに接続されている場合、
Pull RequestにPreview URLが自動でコメントされます。

### noindex / robots.txt

Workers BuildsのPreview URLには **自動でnoindexが付与されません**。
必要に応じて、Worker内で環境変数 `CLOUDFLARE_DEPLOYMENT_ID` や
`CF_PAGES_BRANCH` 相当の値を参照して制御する必要があります。

現在の `src/admin-worker.ts` では、Google OAuth callback URLを
`ADMIN_PUBLIC_ORIGIN` に固定しているため、Preview URLでOAuth認証を完結させる
設計にはなっていません。Preview URLでは認証が必要な操作を実行せず、
UIのレイアウトやアセット配信のみを確認する用途に留めます。

---

## 4. デプロイフロー

### 本番デプロイ（mainブランチへのマージ）

```bash
git switch main
git pull --ff-only
git merge feature/何か
git push
```

Workers Buildsが自動的に次を実行します:

1. `npm install`
2. `npm run build` （Astroが `dist/` を生成）
3. `npx wrangler deploy --config wrangler.admin.jsonc`
4. 本番Worker `atlasez-admin` が更新される

### 非本番ブランチのPreview URL生成

```bash
git switch -c feature/新機能
# ファイル編集・コミット
git push -u origin feature/新機能
```

Workers Buildsが自動的に次を実行します:

1. `npm install`
2. `npm run build`
3. `npx wrangler versions upload --config wrangler.admin.jsonc`
4. Preview URL `https://feature-新機能.atlasez-admin.ukyoukay0.workers.dev` が生成される
5. Pull RequestがあればURLがコメントされる

### ローカルでの確認

```bash
npm ci
npm run dev:admin  # http://localhost:8787/ でWorkerをローカル実行
```

本番と同じビルド結果を確認したい場合:

```bash
npm run build
npx wrangler deploy --config wrangler.admin.jsonc --dry-run
```

---

## 5. D1データベースのマイグレーション

本番D1 `atlasez-reports` へのマイグレーションは **手動** で実行します。
Workers Buildsは自動でマイグレーションを実行しません。

```bash
# 本番D1へマイグレーション適用
npx wrangler d1 migrations apply atlasez-reports --config wrangler.admin.jsonc --remote

# ローカルD1への適用（開発用）
npm run db:reports:local
```

マイグレーションファイルは `migrations/` に配置します。
新しいマイグレーションを追加した場合は、本番デプロイ前に上記コマンドで適用してください。

---

## 6. ロールバック

Cloudflare Workers → atlasez-admin → Deployments → 戻したいバージョンの
「Rollback to this deployment」。

Worker自体はステートレスなので、ロールバックは安全です。
ただし、D1のスキーマ変更を伴うデプロイの場合は、
D1マイグレーションも戻す必要があります（`wrangler d1` には巻き戻し機能がないため、
逆マイグレーションSQLを手動で作成して適用する必要があります）。

---

## 7. カスタムドメイン

Workers & Pages → atlasez-admin → Settings → Triggers → Custom Domains

現在は `atlasez-admin.ukyoukay0.workers.dev` を使用しています。
独自ドメインを追加する場合:

1. Custom Domains → Add Custom Domain
2. `admin.atlasez.org` などを入力
3. Cloudflare DNSに自動でCNAMEが追加される
4. `wrangler.admin.jsonc` の `ADMIN_PUBLIC_ORIGIN` を更新
5. Google OAuth Consoleで認可済みリダイレクトURIを更新
6. 再デプロイ（環境変数の変更は再デプロイで反映される）

---

## 8. GitHub Actionsとの関係

`.github/workflows/ci.yml` は **検証専用** で、Workerのデプロイは行いません。
Workers Buildsが自動デプロイを担当します。

CIでは次を実行します:

- `npm run check` （Astro + TypeScript型チェック）
- `npm run lint` （ESLint）
- `npm run format:check` （Prettier）
- `npm test -- --run` （Vitest単体テスト）
- `npm run build` （ビルドが通るか確認）

E2Eテスト（Playwright）はローカル実行のみです。

---

## 9. トラブルシューティング

### Preview URLが生成されない

1. Workers & Pages → atlasez-admin → Settings → Builds → Enable builds on branches が `All branches` か確認
2. `wrangler.admin.jsonc` に `"preview_urls": true` が追加されているか確認
3. GitHub App `Cloudflare Workers` がリポジトリ `mitukx/atlasez-admin` に接続されているか確認

### ビルドが失敗する

1. Cloudflare Workers → atlasez-admin → Deployments → 最新のデプロイログを確認
2. ローカルで `npm run build` が成功するか確認
3. `.nvmrc` のNode版と一致しているか確認（22）

### Secretが反映されない

Workers BuildsのSecretは `wrangler secret put` でのみ設定できます。
GitHubリポジトリのSecretsやCloudflare PagesのEnvironment variablesとは別管理です。

```bash
npx wrangler secret list --config wrangler.admin.jsonc  # 設定済みSecretを確認
```

### Google OAuthがPreview URLで動かない

`ADMIN_PUBLIC_ORIGIN` が本番URLに固定されているため、Preview URLでは
OAuth callbackが正しく戻りません。これは意図的な設計で、Preview URLでは
認証フローをテストせず、UIとアセット配信のみを確認します。

OAuth認証フローをテストする場合は、ローカル開発環境
（`npm run dev:admin` + `ADMIN_LOCAL_EMAIL`）を使用してください。

---

## 10. まとめ

- **本番デプロイ**: `main` へマージすると Workers Buildsが自動で `wrangler deploy`
- **Preview URL**: 非本番ブランチを push すると `wrangler versions upload` で自動生成
- **Secret管理**: `wrangler secret put` でのみ設定
- **D1マイグレーション**: 手動で `wrangler d1 migrations apply` を実行
- **ロールバック**: Cloudflare ダッシュボードから過去デプロイへ戻す

学習サイト（Cloudflare Pages）と運営Worker（Workers Builds）は別々の
デプロイメカニズムですが、同じリポジトリに共存できます。
