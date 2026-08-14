# ドキュメント索引

やりたいことから探してください。

## 最初に読む

| ドキュメント                                         | 内容                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| **[SITE_ADMINISTRATION.md](SITE_ADMINISTRATION.md)** | **サイト全体の管理・引き継ぎマニュアル。管理担当者は最初に読むこと**        |
| **[DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)**     | **開発者・LLM向けの構成、変更箇所、テスト、権限、D1、デプロイの総合ガイド** |

## 記事を書く・直す

| ドキュメント                                   | 内容                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| **[ADDING_ARTICLES.md](ADDING_ARTICLES.md)**   | **記事の追加手順。まずここ**（コマンド・本文の書き方・詰まりどころ） |
| [CONTENT_MODEL.md](CONTENT_MODEL.md)           | frontmatter の全項目と、概念・記事の二層構造                         |
| [CONCEPT_GRAPH.md](CONCEPT_GRAPH.md)           | 概念グラフの線の意味、学習地図の見え方、線の足し方                   |
| [EDITORIAL_WORKFLOW.md](EDITORIAL_WORKFLOW.md) | ブランチ・PR・査読・公開の流れ                                       |
| [BACKLOG.md](BACKLOG.md)                       | 着手前の積み残しメモ                                                 |
| [SUMMARY_TODO.md](SUMMARY_TODO.md)             | 要約が定型文のままの記事一覧（手書き待ち）                           |

## サイトを運用する

| ドキュメント                         | 内容                                                    |
| ------------------------------------ | ------------------------------------------------------- |
| [PUBLISH.md](PUBLISH.md)             | 公開チェックリスト（Cloudflare Pages の設定・確認項目） |
| [DEPLOYMENT.md](DEPLOYMENT.md)       | 環境変数・独自ドメイン移行・ロールバック                |
| [ACCESSIBILITY.md](ACCESSIBILITY.md) | WCAG 2.2 AA への対応方針と検査方法                      |

## 設計を知る

| ドキュメント                                                     | 内容                                   |
| ---------------------------------------------------------------- | -------------------------------------- |
| [INFORMATION_ARCHITECTURE.md](INFORMATION_ARCHITECTURE.md)       | サイトマップ・URL 設計・ナビゲーション |
| [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md)                       | デザイン原則                           |
| [ADR-001-TECH-STACK.md](ADR-001-TECH-STACK.md)                   | Astro を選んだ理由                     |
| [ADR-002-REPOSITORY-STRATEGY.md](ADR-002-REPOSITORY-STRATEGY.md) | 単一リポジトリにした理由               |

## 経緯（読まなくても運用できます）

`history/` は Google Sites からの移行時の記録です。現状の説明ではありません。

| ドキュメント                                                   | 内容                                      |
| -------------------------------------------------------------- | ----------------------------------------- |
| [history/CHANGELOG-v2.md](history/CHANGELOG-v2.md)             | 2026-07-26 の改修ログ（何をなぜ直したか） |
| [history/CURRENT_SITE_AUDIT.md](history/CURRENT_SITE_AUDIT.md) | 移行元 Google Sites の調査と URL 対応表   |
| [history/MIGRATION_PLAN.md](history/MIGRATION_PLAN.md)         | 段階移行の計画                            |
| [history/ASSUMPTIONS.md](history/ASSUMPTIONS.md)               | 実装時に置いた仮定                        |

---

## スクリプト早見表

`scripts/` の中身です。データを書き換えるものは `--dry` を付けると変更内容の表示だけ行います。

### 日常的に使う

| コマンド                              | 何をするか                                             |
| ------------------------------------- | ------------------------------------------------------ |
| `npm run new:article -- ...`          | 記事の雛形と概念を作る（[使い方](ADDING_ARTICLES.md)） |
| `node scripts/validate-content.mjs`   | 必須項目・ID 重複・概念参照・循環・置き場所を検査      |
| `node scripts/check-links.mjs dist /` | ビルド結果の内部リンク切れを検査                       |
| `node scripts/audit-math.mjs`         | 公開組版と互換性のない数式を検査                       |

### 一括修正（原則もう使わないが、再発時の道具）

| コマンド                                       | 何をするか                                  |
| ---------------------------------------------- | ------------------------------------------- |
| `node scripts/regenerate-summaries.mjs --list` | 要約が定型文のままの記事を一覧する          |
| `node scripts/fix-math-japanese.mjs`           | 数式内の生の日本語を `\text{}` で囲む       |
| `node scripts/fix-heading-levels.mjs`          | 本文の見出しを繰り上げ、h1→h3 の飛びを直す  |
| `node scripts/fix-kanji-tables.mjs`            | 漢字の一字表を 2 列（漢字・読み）に組み直す |
| `node scripts/tidy-kanji-articles.mjs`         | 漢字記事の空見出し・余分な水平線を掃除する  |
| `node scripts/add-cross-subject-links.mjs`     | 分野をまたぐ概念の関連を追加する            |
| `node scripts/restructure-kanji-graph.mjs`     | 漢字の擬似的な学習順を解体する              |

いずれも**何度実行してもよい**ように作ってあります（すでに直っているものは触りません）。

### 移行時のみ使用（履歴として保存）

`import-articles.mjs` / `import-more.mjs` / `import-atlas-members.mjs` /
`import-utils.mjs` は Google Sites からの一括移植に使ったものです。
`import-utils.mjs` だけは `makeSummary` などを他スクリプトが使うため現役です。
