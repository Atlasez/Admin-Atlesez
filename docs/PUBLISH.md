# 公開チェックリスト

このリポジトリには **2つの配信システム** があります:

1. **学習サイト（Cloudflare Pages）**: `Atlasez/Atlasez01` → 公開リポジトリの学習コンテンツ
2. **運営Worker（Workers Builds）**: `mitukx/atlasez-admin` → 非公開の運営ツール

このファイルは **学習サイト（Cloudflare Pages）** の公開手順です。
**運営Worker** のデプロイは `docs/DEPLOYMENT_ADMIN_WORKER.md` を参照してください。

---

## 1. push する（学習サイト）

```bash
cd <このリポジトリをcloneした場所>
git push
```

push すると Cloudflare Pages のビルドが自動で始まる。

## 2. Cloudflare Pages のビルド設定を確認する

Workers & Pages → プロジェクト → Settings → Build

| 項目                   | 値              |
| ---------------------- | --------------- |
| Build command          | `npm run build` |
| Build output directory | `dist`          |
| Production branch      | `main`          |

Root directory は空欄のまま。Node は `.nvmrc`（22）が読まれる。

## 3. 環境変数を入れる

Settings → Environment variables → **Production** にだけ追加:

```
SITE_URL = https://<プロジェクト名>.pages.dev
```

独自ドメインを取ったらここを書き換えて再デプロイする。
**Preview には設定しない**（設定しないことでプレビューが自動的に
noindex 扱いになり、本番と重複しない）。

環境変数を足したあとは Deployments → 最新のデプロイ → Retry deployment。
変数の変更は自動では反映されない。

## 3.5 PR ごとのプレビューを使う

ブランチを push すると、Cloudflare Pages が本番とは別にプレビューを作る。

```bash
git switch -c feature/なにか
# 変更してコミット
git push -u origin feature/なにか
```

数分で `https://feature-なにか.<project>.pages.dev` が見られるようになる。
本番（main）は上書きされない。PR を作れば URL がコメントされる。

うまく出ないときは Settings → Builds & deployments の
**Preview deployments** が `All branches` かどうかを見る。

## 4. 公開後に確認すること

- [ ] トップ `/` と学習サイト `/atlas/ja/` が開く
- [ ] 検索（`/atlas/ja/search/`）が動く ← Pagefind のインデックスが配信されているか
- [ ] 学習地図（`/atlas/ja/map/`）が描画される
- [ ] `/robots.txt` の `Sitemap:` が本番URLになっている
- [ ] 記事ページのソースに `noindex` が **入っていない**
- [ ] 数式（KaTeX）が崩れていない ← 例: `/atlas/ja/mathematics/set-theory/relations/`

## 5. GitHub 側の後始末

GitHub Pages への自動デプロイは停止済み。
Settings → Pages → Source を「None」に戻しておくと、古い内容が
`mitukx.github.io/Atlasez01/` に残り続けるのを防げる。

## 6. 独自ドメインを取ったら

`docs/DEPLOYMENT.md` の「3. 独自ドメインを取得したあとの手順」を参照。
やることは Custom domains への追加と `SITE_URL` の変更、再デプロイの 3 つ。

## 7. ローカルで確認したいとき

```bash
npm ci
npm run dev        # http://localhost:4321/ （学習サイト）
npm run dev:admin  # http://localhost:8787/ （運営Worker）
```

---

## 運営Worker（atlasez-admin）のデプロイ

運営Worker `atlasez-admin` のデプロイ手順は **別ドキュメント** です:

→ **[docs/DEPLOYMENT_ADMIN_WORKER.md](DEPLOYMENT_ADMIN_WORKER.md)**

Workers Buildsを使用し、D1、Cron、Google OAuth、Discord通知などの機能を
持つWorkerを自動デプロイします。Preview URLの形式やSecret管理が
Cloudflare Pagesとは異なるため、専用ドキュメントを参照してください。
