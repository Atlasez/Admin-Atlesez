# Atlasez01 (atlasez-web)

学生団体 **Atlasez** の公式サイトと、学習サイト **「アトラス」** のソースコード。
Astro で純粋な静的 HTML を生成し、Cloudflare Pages で公開しています。

- 公式サイト: `/`（団体紹介・プロジェクト・お知らせ・運営募集）
- 学習サイト: `/atlas/ja/`（記事・学習地図・検索・表示設定・運営紹介）

---

## はじめての人へ

やりたいことが決まっているなら、**[docs/README.md](docs/README.md) の索引**から探すのが早いです。

- **記事を追加したい** → [docs/ADDING_ARTICLES.md](docs/ADDING_ARTICLES.md)
- **公開まわりを触りたい** → [docs/PUBLISH.md](docs/PUBLISH.md) / [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **学習地図の仕組みを知りたい** → [docs/CONCEPT_GRAPH.md](docs/CONCEPT_GRAPH.md)

## クイックスタート

```bash
npm ci             # 依存導入（Node は .nvmrc の 22）
npm run dev        # 開発サーバー http://localhost:4321
npm run build      # 本番ビルド（dist/）＋検索インデックス生成
npm run preview    # ビルド結果の確認
```

## 主なコマンド

```bash
npm run new:article -- --subject chemistry --category matter --slug gases --title 気体
                           # 記事の雛形と概念を作る

npm run check              # TypeScript / Astro の型チェック
npm run lint               # ESLint
npm run format             # Prettier（確認だけなら format:check）
npm test                   # 単体テスト（Vitest）
npm run test:e2e           # E2E + axe（要: npm run build と npx playwright install）

node scripts/validate-content.mjs      # コンテンツ検証
node scripts/check-links.mjs dist /    # 内部リンク検証
```

スクリプトの全一覧は [docs/README.md](docs/README.md) にあります。

## ディレクトリ

```text
src/
├── content/        # ★ コンテンツ（概念・記事・お知らせ・プロジェクト・分野）
│   ├── concepts/concepts.yaml   # 概念グラフ（学習地図と記事間リンクの元）
│   ├── subjects/subjects.yaml   # 分野とカテゴリの定義
│   └── articles/ja/<分野>/<カテゴリ>/<slug>.md
├── pages/          # ルーティング（/ = 公式, /atlas/ = 学習サイト）
├── layouts/        # OrgLayout / AtlasLayout
├── components/     # 共通UI（BaseHead, Breadcrumb, A11ySettings, ThemeToggle）
├── lib/            # 概念グラフ・i18n・URL・デプロイ判定・ブックマーク
└── styles/         # デザイントークンと基本スタイル
public/             # 静的ファイル。_headers は Cloudflare Pages の設定
scripts/            # 検証・一括修正・記事の足場
tests/              # unit (Vitest) / e2e (Playwright + axe)
docs/               # ドキュメント（docs/README.md が索引）
versions/           # 過去バージョンのスナップショット（ビルド対象外）
.github/workflows/  # CI（検証のみ。配信は Cloudflare Pages）
```

## 記事が公開されるまで

1. `src/content/articles/ja/<分野>/<カテゴリ>/<slug>.md` を追加（`npm run new:article` が楽）
2. `status: published` にして PR
3. CI が検証（スキーマ・概念参照・循環・リンク・型・lint・テスト・E2E・axe）
4. main へマージすると Cloudflare Pages が自動でビルドして公開

`draft` と `in-review` の記事はビルドから除外されるため、
main にマージされていても公開されません。

## デプロイ

Cloudflare Pages がこのリポジトリを直接ビルドします。
GitHub Actions は検証専用でデプロイしません。

URL は環境変数 `SITE_URL`（未設定なら Cloudflare の `CF_PAGES_URL`）で決まります。
`main` 以外のブランチのビルドは自動で `noindex` になります。
詳細は [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 多言語について

英語版は翻訳が 4 記事しかなく日本語版との差が大きすぎたため、一旦取り下げました。
仕組みは残してあるので、`src/lib/i18n.ts` の `LOCALES` に `"en"` を戻し、
`src/content/articles/en/` に記事を置けばルーティング・言語切替・hreflang が動きます。

## ライセンス

コード: MIT（[LICENSE](LICENSE)）。記事コンテンツのライセンスは団体で別途決定すること
（教育目的の場合は CC BY-SA 4.0 を推奨候補として CONTRIBUTING.md に記載）。
