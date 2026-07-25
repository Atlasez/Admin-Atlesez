# ADR-001: 技術スタック

- 状態: 採用
- 日付: 2026-07-22

## 決定

**Astro（最新安定版・静的生成）+ TypeScript strict + Content Collections (Zod) + Markdown/MDX + Cytoscape.js + Pagefind** を採用する。ビルド成果物は純粋な静的HTML/CSS＋最小限のJSで、GitHub Pagesにそのまま公開できる（発注要件「基本HTMLサイト」「GitHub Pagesで公開」を満たす）。

## 比較

| 項目                        | Astro                               | Next.js              | Nuxt           | Docusaurus               | 手書きHTML       |
| --------------------------- | ----------------------------------- | -------------------- | -------------- | ------------------------ | ---------------- |
| 大量の学習記事              | ◎ Content Collections + glob loader | ○ 要自作             | ○ Nuxt Content | ◎ docs特化               | × 全ページ手編集 |
| Markdown/MDX                | ◎ 組み込み                          | ○ 要設定             | ○              | ◎                        | ×                |
| 多言語（非一対一翻訳）      | ◎ ルーティング自由・自作モデル可    | ○                    | ○              | △ 一対一前提のi18nが強い | ×                |
| 静的生成                    | ◎ デフォルト                        | ○ export時に機能制限 | ○              | ◎                        | ◎                |
| インタラクティブなグラフ    | ◎ Islandで必要ページのみJS          | ◎                    | ◎              | ○                        | △                |
| 検索                        | ◎ Pagefind公式連携例が豊富          | ○                    | ○              | ○ Algolia前提が多い      | ×                |
| GitHub共同編集              | ◎ mdファイル単位                    | ○                    | ○              | ◎                        | △                |
| ビルド時間                  | ◎ 高速・コンテンツ差分              | △                    | △              | ○                        | -                |
| 保守性                      | ◎ HTML中心・依存少                  | △ React全面依存      | △              | △ テーマ拘束             | △                |
| GitHub Pages / 独自ドメイン | ◎ base/site設定のみ                 | ○                    | ○              | ◎                        | ◎                |
| 将来の動的機能              | ○ アダプタでSSR化可能               | ◎                    | ◎              | △                        | ×                |
| 非エンジニアの執筆          | ◎ frontmatter+Markdownのみ          | △                    | △              | ◎                        | ×                |

Docusaurusはドキュメントサイトとしては優秀だが、(1) 一対一対応前提のi18nが本プロジェクトの二層コンテンツモデルと相性が悪い、(2) デザインがテーマに拘束され「独自の簡素なデザイン」要件に反する、(3) 団体サイトと学習サイトの2トーン分離がしにくい、ため不採用。Next.js/Nuxtは静的サイトには過剰で、JSペイロードと保守コストが増える。

## 詳細な選定

- **TypeScript strict mode**: `astro/tsconfigs/strict` を継承
- **Zod**: Content Collectionsのスキーマ検証（`docs/CONTENT_MODEL.md`）
- **数式**: remark-math + rehype-katex（ビルド時レンダリング、クライアントJS不要）
- **コード**: Shiki（Astro組み込み、ビルド時ハイライト）
- **学習地図**: Cytoscape.js。**PreactのIslandではなくAstroの`<script>`（バンドルされるvanilla TSモジュール）として実装**。理由: グラフページ以外にUIフレームワークが不要で、依存を1つ（cytoscape）に抑えられ、出力HTMLがより「基本HTML」に近くなる。機能要件（ドラッグ・ズーム・fold/経路探索・URL共有）はすべて満たす。将来コンポーネント化が必要になればPreact Island化は局所変更で可能
- **検索**: Pagefind（ビルド後インデックス生成、完全静的、日本語対応）。検索UIは`src/lib/search.ts`の薄いラッパー越しに使い、将来Algolia等へ差し替え可能にする
- **デザイントークン**: CSS Custom Properties（`src/styles/tokens.css`）
- **テスト**: Vitest（グラフ・スキーマの単体テスト）+ Playwright（主要画面E2E・axe-core検査）
- **パッケージ管理**: pnpm推奨。ただし本環境ではpnpmが利用できないためnpmで検証した（`package-lock.json`をコミット。pnpm利用時は`pnpm import`可能）
- **Lint/Format**: Prettier必須、ESLintはCIで実行（設定は`eslint.config.mjs`）

## 帰結

- 執筆者はMarkdown＋frontmatterのみ書けばよい
- JS無効環境でも記事本文・ナビゲーション・階層リスト版の学習地図が動作する
- 動的機能（コメント・進捗保存等）が必要になった場合はAstroアダプタまたは外部APIで追加する
