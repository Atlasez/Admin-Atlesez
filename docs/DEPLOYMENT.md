# デプロイ（DEPLOYMENT）

本番配信は **Cloudflare Pages** が GitHub リポジトリを直接ビルドして行う。
GitHub Actions は検証（CI）専用で、デプロイはしない。

## 1. 構成の切り替えは環境変数のみ

| 変数        | 役割                                    | 本番で入れる値            |
| ----------- | --------------------------------------- | ------------------------- |
| `SITE_URL`  | canonical・OGP・sitemap の絶対URLのもと | `https://<独自ドメイン>`  |
| `BASE_PATH` | サブディレクトリ配信のときだけ使う      | `/`（既定値なので省略可） |

`astro.config.mjs` のフォールバックは次の順:

```
SITE_URL → CF_PAGES_URL（Cloudflareが自動で入れる） → http://localhost:4321
```

`SITE_URL` を **Production 環境にだけ**設定しておけば、プレビュー配信は
自分自身の `*.pages.dev` URL を canonical に使うので、本番URLと取り違えない。

## 2. Cloudflare Pages の設定

Workers & Pages → 対象プロジェクト → Settings。

### ビルド設定

| 項目                   | 値                       |
| ---------------------- | ------------------------ |
| Framework preset       | Astro（または None）     |
| Build command          | `npm run build`          |
| Build output directory | `dist`                   |
| Root directory         | （空欄。リポジトリ直下） |
| Production branch      | `main`                   |

Node のバージョンはリポジトリの `.nvmrc`（22）が使われる。

### 環境変数

Settings → Environment variables

| 変数       | Production               | Preview    |
| ---------- | ------------------------ | ---------- |
| `SITE_URL` | `https://<独自ドメイン>` | 設定しない |

運営参加応募のメール通知（任意）には、Cloudflare Worker の Secret／Variable として次を設定する。

| 変数                             | 種類     | 用途                                                                |
| -------------------------------- | -------- | ------------------------------------------------------------------- |
| `RESEND_API_KEY`                 | Secret   | Resend の送信APIキー。リポジトリには保存しない                      |
| `APPLICATION_NOTIFICATION_EMAIL` | Variable | 応募通知の受信先（複数はカンマ区切り）                              |
| `EMAIL_FROM`                     | Variable | Resendで検証済みの送信元（例：`Atlasez運営 <noreply@example.org>`） |

未設定の場合も応募内容の保存は行われ、メール通知だけが停止する。Resend側で送信元ドメインを検証してから本番Secretを登録すること。

設定例（値はCloudflareにだけ保存し、リポジトリには書かない）:

```sh
npx wrangler secret put RESEND_API_KEY --config wrangler.admin.jsonc
npx wrangler deploy --config wrangler.admin.jsonc --var APPLICATION_NOTIFICATION_EMAIL:受信先@example.com --var EMAIL_FROM:'Atlasez運営 <noreply@example.com>'
```

`APPLICATION_NOTIFICATION_EMAIL` はカンマ区切りで複数の運営者を指定できる。ResendのAPIキーが未登録の間は、応募をD1とDiscordへ保存・通知し、メールだけを送信しない。

独自ドメインを取るまでは `SITE_URL` に発行済みの `https://<project>.pages.dev`
を入れておく。ドメイン取得後はこの1箇所を書き換えるだけでよい。

### PR ごとのプレビュー配信

Cloudflare Pages は **push されたブランチごとに自動でビルドし、専用の URL を発行する**。
本番を上書きすることはないので、PR を並行して走らせても互いに干渉しない。

| 何を push したか        | 出来るもの                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `main`                  | 本番（独自ドメイン / `<project>.pages.dev`）                                                      |
| その他のブランチ        | プレビュー `https://<ブランチ名>.<project>.pages.dev`                                             |
| 同ブランチへの追加 push | 上のブランチ URL が最新に差し替わる。過去分も `https://<コミットhash>.<project>.pages.dev` で残る |

ブランチ名の URL は固定なので、PR のレビュー依頼に貼るのはこちらが便利。

**設定の確認**（Workers & Pages → プロジェクト → Settings → Builds & deployments）

1. **Preview deployments** が `All branches` になっていること
   （`None` だとプレビューが作られない）
2. **Environment variables** の `SITE_URL` が **Production にだけ**入っていること。
   Preview 側に入れると、プレビューが本番URLを canonical に出してしまう
3. GitHub App 連携で入れていれば、PR に プレビューURL が自動でコメントされる。
   出ない場合は Cloudflare の GitHub App がそのリポジトリに許可されているか確認する

**プレビューは検索エンジンに出ない。** `main` 以外のビルドは自動で全ページ
`noindex, nofollow` になり、`robots.txt` も `Disallow: /` になる
（`src/lib/deploy.ts` が `CF_PAGES_BRANCH` を見て判定）。
本番と同じ内容が二重にインデックスされる事故を防ぐため。

### プレビュー配信の扱い

`main` 以外のブランチのビルドは自動的に

- 全ページに `<meta name="robots" content="noindex, nofollow">`
- `robots.txt` が `Disallow: /`

になる（`src/lib/deploy.ts` が `CF_PAGES_BRANCH` を見て判定）。
本番と同じ内容が検索結果に二重に出るのを防ぐため。

## 3. 独自ドメインを取得したあとの手順

1. Cloudflare でドメインを登録（既に Cloudflare がネームサーバなら DNS 設定は自動）
2. Pages プロジェクト → Custom domains → ドメインとサブドメインを追加
3. Settings → Environment variables → Production の `SITE_URL` を新ドメインに変更
4. **再デプロイ**（環境変数の変更だけでは反映されない。Deployments → Retry deployment）
5. `https://<ドメイン>/robots.txt` に正しい sitemap URL が出ているか確認
6. Google Search Console にドメインと `sitemap-index.xml` を登録

`public/CNAME` は GitHub Pages 用の仕組みなので、Cloudflare Pages では不要。

## 4. 学習サイトをサブドメインに分けたい場合

`atlasez.org`（組織サイト）と `atlas.atlasez.org`（学習サイト）に分ける案。
現状は 1 プロジェクトで `/` と `/atlas/` に同居している。分けるなら:

- 同じリポジトリで Pages プロジェクトを 2 つ作り、それぞれ別の
  `SITE_URL` とビルド設定（出力を絞る）を与える
- あるいは 1 プロジェクトのまま `_redirects` で
  `atlas.atlasez.org/*` → `atlasez.org/atlas/:splat` に寄せる

どちらも内部リンクの生成（`src/lib/site.ts`）の見直しが必要なので、
やるならドメイン確定後にまとめて。

## 5. `public/_headers`

Cloudflare Pages はこのファイルを設定として読み、配信物には含めない。

- 全ページに `nosniff` / `Referrer-Policy` / `X-Frame-Options` などを付与
- `/_astro/*`（ハッシュ付きファイル名）は 1 年 immutable
- `/pagefind/*`・`/images/*` は 1 週間

## 6. ロールバック

Cloudflare Pages → Deployments → 戻したいデプロイの「…」→ Rollback。
ビルド成果物の差し替えだけなので、状態を持たない当サイトでは安全。
GitHub 側を戻したい場合は該当コミットを `git revert` して push。

## 7. GitHub Pages について

以前は GitHub Actions から `actions/deploy-pages` で公開していたが、
Cloudflare Pages と二重公開になり重複コンテンツになるため停止した。
戻す場合は `.github/workflows/ci.yml` に `deploy` ジョブを復活させ、
`BASE_PATH` を `/<リポジトリ名>` に戻す必要がある。

GitHub 側の設定も Settings → Pages → Source を「None」に戻しておくとよい。

## 8. ローカルでの確認

```bash
npm ci
npm run dev            # http://localhost:4321/
```

本番と同じ絶対URLで確認したいとき:

```bash
SITE_URL=https://example.com npm run build
npm run preview
```
