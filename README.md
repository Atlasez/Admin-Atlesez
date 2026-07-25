# Atlasez01 (atlasez-web)

学生団体 **Atlasez** の公式サイトと、学習プラットフォーム **学習サイト「アトラス」** のソースコード。
Google Sitesからの移行先として、Astroで純粋な静的HTMLを生成し、GitHub Pagesで公開する。

- 公式サイト: `/`（団体紹介・プロジェクト・お知らせ・運営募集）
- 学習サイト: `/atlas/ja/`, `/atlas/en/`（記事・学習地図・検索・表示設定）

## クイックスタート

```bash
npm install        # 依存導入（pnpmでも可）
npm run dev        # 開発サーバー http://localhost:4321
npm run build      # 本番ビルド（dist/）＋検索インデックス生成
npm run preview    # ビルド結果の確認
```

主なコマンド:

```bash
npm run check              # TypeScript / Astroの型チェック
npm run lint               # ESLint
npm run format:check       # Prettier
npm test                   # 単体テスト（Vitest）
npm run test:e2e           # E2E + axe（要: npm run build と npx playwright install）
node scripts/validate-content.mjs   # コンテンツ検証（重複ID・循環・参照切れ）
node scripts/check-links.mjs dist   # 内部リンク検証
```

## 記事を書くには

`src/content/articles/<locale>/<subject>/<category>/<slug>.md` を追加してPRを出すだけ。
frontmatterの書き方は [docs/CONTENT_MODEL.md](docs/CONTENT_MODEL.md)、
フローは [docs/EDITORIAL_WORKFLOW.md](docs/EDITORIAL_WORKFLOW.md) を参照。
`status: published` の記事だけが本番に公開される。

## ディレクトリ

```text
src/
├── content/        # ★ コンテンツ（概念・記事・お知らせ・プロジェクト・分野）
├── pages/          # ルーティング（/ = 公式, /atlas/ = 学習サイト）
├── layouts/        # OrgLayout / AtlasLayout
├── components/     # 共通UI（BaseHead, Breadcrumb, A11ySettings）
├── lib/            # 概念グラフ・i18n・検索抽象化・URL
└── styles/         # デザイントークンと基本スタイル
scripts/            # コンテンツ・リンク検証
tests/              # unit (Vitest) / e2e (Playwright + axe)
docs/               # 設計ドキュメント一式
.github/workflows/  # CI（検証）と GitHub Pages デプロイ
```

## デプロイ

mainへのマージで自動的にGitHub Pagesへ公開される（`.github/workflows/ci.yml`）。
URL・ベースパスは環境変数 `SITE_URL` / `BASE_PATH` のみで切替可能。
独自ドメイン・Cloudflare Pages移行は [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## ドキュメント

| ファイル                                                                   | 内容                                   |
| -------------------------------------------------------------------------- | -------------------------------------- |
| [docs/CURRENT_SITE_AUDIT.md](docs/CURRENT_SITE_AUDIT.md)                   | 現行Google Sitesの調査とURL移行表      |
| [docs/INFORMATION_ARCHITECTURE.md](docs/INFORMATION_ARCHITECTURE.md)       | 情報設計・サイトマップ・ナビゲーション |
| [docs/ADR-001-TECH-STACK.md](docs/ADR-001-TECH-STACK.md)                   | 技術選定（Astro採用の比較検討）        |
| [docs/ADR-002-REPOSITORY-STRATEGY.md](docs/ADR-002-REPOSITORY-STRATEGY.md) | リポジトリ構成（モノレポ採用）         |
| [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md)                       | デザイン原則・分野ホーム三案の評価     |
| [docs/CONTENT_MODEL.md](docs/CONTENT_MODEL.md)                             | 概念×記事の二層コンテンツモデル        |
| [docs/EDITORIAL_WORKFLOW.md](docs/EDITORIAL_WORKFLOW.md)                   | 執筆・査読・公開フロー                 |
| [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md)                             | WCAG 2.2 AA対応の実装と検査            |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)                                   | デプロイ・ホスティング比較             |
| [docs/MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md)                           | Google Sitesからの段階移行計画         |
| [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md)                                 | 実装時に置いた仮定                     |

## ライセンス

コード: MIT（[LICENSE](LICENSE)）。記事コンテンツのライセンスは団体で別途決定すること
（教育目的の場合はCC BY-SA 4.0を推奨候補としてCONTRIBUTING.mdに記載）。
