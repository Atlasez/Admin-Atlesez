# コンテンツモデル（CONTENT_MODEL）

スキーマの実体は `src/content.config.ts`（Zodで検証、違反はビルド失敗）。

## 1. 二層構造

**概念（言語非依存）** と **記事（言語別）** を分離する。翻訳は概念を介して対応づけるため、言語間で記事が一対一に対応する必要がない。

```text
概念: math.set-theory.sets ──┬── ja記事: 集合の定義と表し方（sets）
                             └── en記事: Sets and Set Operations（2概念を1記事で扱う）
概念: math.set-theory.set-operations ──┬── ja記事: 集合の演算
                                       └── en記事: （上と同じ記事）
```

サンプル内の実例:

- **ja 2記事 → en 1記事**: `sets` + `set-operations` → `sets-and-operations`
- **ja 1記事 → en 2記事**: `関係と同値関係`（relations + equivalence-relations） → `Binary Relations` と `Equivalence Relations and Quotient Sets`

## 2. 概念（`src/content/concepts/concepts.yaml`）

```yaml
- id: math.linear-algebra.vector-space # 永続ID: subject.category.name
  subject: mathematics
  category: linear-algebra
  name: { ja: 線形空間, en: Vector Spaces }
  prerequisites: [math.set-theory.mappings] # 理解の前提
  recommendedNext: [math.linear-algebra.linear-map]
  related: [math.group-theory.group-definition]
  partOf: null # 包含関係（任意）
  alternatives: [] # 別経路・別解説（任意）
```

- IDは一度公開したら変更しない（URLのslugとは独立）
- `prerequisites` は循環禁止（CIとビルドで検査）

## 3. 記事（`src/content/articles/<locale>/<subject>/<category>/<slug>.md`）

```yaml
---
articleId: ja-math-vector-space-introduction # 記事の永続ID
locale: ja
title: 線形空間の定義
slug: vector-space # URL用（変更可能。変更時はリダイレクト検討）
subject: mathematics
category: linear-algebra
concepts: # 1記事が1つ以上の概念を説明できる
  - id: math.linear-algebra.vector-space
    anchor: definition # 記事内アンカー（任意）
prerequisites: [] # 記事レベルの追加前提（任意）
related: []
authors: [atlas-math-team]
reviewers: [example-reviewer]
status: published # draft | in-review | published
createdAt: 2025-05-01
updatedAt: 2026-07-16
summary: 線形空間の公理と基本例を説明します。
difficulty: intermediate # introductory | basic | intermediate | advanced
estimatedMinutes: 20
tags: [線形代数]
aliases: [ベクトル空間, vector space]
exerciseIds: { pre: [], post: [] } # 演習（現在プレースホルダー）
references:
  - title: 齋藤正彦『線型代数入門』東京大学出版会
---
```

- `status: published` 以外はビルドから除外され本番に出ない
- 前提記事・関連記事・次に読む記事は、概念グラフ＋frontmatterから自動導出（`src/lib/content.ts`）

## 4. 分野（`src/content/subjects/subjects.yaml`）

23分野を定義。`status: published | preparing`、任意の `externalUrl`（移行前の現行Google Sitesへの案内）、`categories[]`（大分類: 名称・説明・順序・入口概念・関連カテゴリ）。

## 5. お知らせ・プロジェクト

- お知らせ: `src/content/news/*.md`（title, date, category=announcement|report|release, project, tags, summary, status）
- プロジェクト: `src/content/projects/projects.yaml`（データ追加だけで公式サイトに掲載される）

## 6. 演習（将来拡張）

`exerciseIds.pre/post` にIDを持たせる設計のみ先行導入。演習コレクション追加時は
`exercises` collection（id, conceptIds, locale, type, body, answer）を定義し、
記事ページの「準備中」バッジをリンクに置き換える。
