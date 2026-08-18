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

## 2. PR必須ワークフローとmainブランチ保護

**すべての変更は Pull Request 経由で main ブランチに反映すること。**

### main への直接反映禁止

以下の操作は **禁止** です:

- `main` ブランチへの直接 `git push`
- ローカルで `main` に `git merge` してから `git push`
- エージェントによる自動マージ（`gh pr merge` 等）

**理由**:

- Cloudflare Workers Builds は `main` への push をトリガーに本番デプロイを実行する
- 人間によるレビューと GitHub 上での明示的なマージ操作を必須とすることで、本番環境への意図しない変更を防ぐ
- CI/CD、Preview URL、コードレビューのワークフローを確実に通すため

### 標準作業フロー

1. **トピックブランチの作成**

   ```bash
   git switch main
   git pull --ff-only
   git switch -c feature/機能名  # または fix/バグ名
   ```

2. **変更のコミットとプッシュ**

   ```bash
   # ファイル編集
   git add <変更したファイル>
   git commit -m "変更内容"
   git push -u origin feature/機能名
   ```

   この時点で Workers Builds が Preview URL を自動生成します。

3. **Pull Request の作成**

   ```bash
   gh pr create --web
   ```

   PR 作成時は `.github/pull_request_template.md` のチェックリストに従います。

4. **CI / Preview URL の確認**
   - GitHub Actions の CI が成功していることを確認
   - Cloudflare Workers Builds が生成した Preview URL で動作確認

5. **コードレビュー**
   - レビュアーによる確認
   - 必要に応じて追加コミットで対応

6. **GitHub UI でのマージ**
   - レビュー完了後、**必ず GitHub の UI で "Merge pull request" を実行**
   - マージ後、Workers Builds が自動的に本番デプロイを実行

7. **ローカルブランチのクリーンアップ**
   ```bash
   git switch main
   git pull --ff-only
   git branch -d feature/機能名
   ```

詳細とエージェント向けの絶対ルールは、リポジトリ直下の `AGENTS.md` を参照してください。

---

## 3. Workers Buildsの設定

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

### Preview URLの動作

Preview URLは以下の仕様で動作します:

- **ブランチ名ベースのURL**: `https://<ブランチ名>.atlasez-admin.ukyoukay0.workers.dev`
  - 同じブランチへの再push時は、このURLが最新バージョンに自動的に差し替わります
- **バージョン固定URL**: `https://<version-prefix>.atlasez-admin.ukyoukay0.workers.dev`
  - 過去のバージョンも version prefix 付きURLで永続的にアクセス可能です

PR に Cloudflare Workers GitHub App が自動的に Preview URL をコメントします。

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

## 4. デプロイフロー

### 重要: 通常の変更では wrangler deploy を直接実行しない

本番デプロイは **Cloudflare Workers Builds** が `main` への push 時に自動実行します。
開発者が手動で `wrangler deploy` を実行する必要はありません。

### 本番デプロイ（main ブランチへの PR マージ）

PR を GitHub UI でマージすると、Workers Builds が自動的に次を実行します:

1. `npm install`
2. `npm run build` （Astro が `dist/` を生成）
3. `npx wrangler deploy --config wrangler.admin.jsonc`
4. 本番 Worker `atlasez-admin` が更新される

**注意**: ローカルで `git merge` → `git push` は禁止です。必ず GitHub UI でマージしてください。

### Preview URL の生成（非 main ブランチの push）

トピックブランチを push すると、Workers Builds が自動的に次を実行します:

1. `npm install`
2. `npm run build`
3. `npx wrangler versions upload --config wrangler.admin.jsonc`
4. Preview URL が生成される
   - ブランチ名ベース: `https://<ブランチ名>.atlasez-admin.ukyoukay0.workers.dev`
   - バージョン固定: `https://<version-prefix>.atlasez-admin.ukyoukay0.workers.dev`
5. Pull Request があれば URL が自動コメントされる

### ローカルでの確認

```bash
npm ci
npm run dev:admin  # http://localhost:8787/ で Worker をローカル実行
```

本番と同じビルド結果を確認したい場合:

```bash
npm run build
npx wrangler deploy --config wrangler.admin.jsonc --dry-run
```

### Preview URL の制約

現在の `src/admin-worker.ts` では、Google OAuth callback URL を
`ADMIN_PUBLIC_ORIGIN` に固定しているため、Preview URL で OAuth 認証を完結させる
設計にはなっていません。Preview URL では認証が必要な操作を実行せず、
UI のレイアウトやアセット配信のみを確認する用途に留めます。

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

- **PR必須**: すべての変更は Pull Request 経由で main に反映（`AGENTS.md` 参照）
- **本番デプロイ**: PR マージ時に Workers Builds が自動で `wrangler deploy`
- **Preview URL**: 非本番ブランチ push 時に `wrangler versions upload` で自動生成（ブランチ名ベース + バージョン固定）
- **手動 deploy 不要**: 通常の変更では `wrangler deploy` を直接実行しない
- **Secret管理**: `wrangler secret put` でのみ設定
- **D1マイグレーション**: 手動で `wrangler d1 migrations apply --remote` を実行
- **ロールバック**: Cloudflare ダッシュボードから過去デプロイへ戻す

学習サイト（Cloudflare Pages）と運営Worker（Workers Builds）は別々の
デプロイメカニズムですが、同じリポジトリに共存できます。
