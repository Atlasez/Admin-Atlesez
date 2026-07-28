# 記事を追加する

このページだけ読めば記事を 1 本追加できるようにしています。
仕組みの背景は [CONTENT_MODEL.md](CONTENT_MODEL.md)、
査読と公開の流れは [EDITORIAL_WORKFLOW.md](EDITORIAL_WORKFLOW.md) を見てください。

---

## いちばん短い手順

```bash
npm ci                      # 最初の一回だけ
npm run new:article -- --subject chemistry --category matter --slug gases --title 気体
```

これで次の 2 つが用意されます。

- `src/content/articles/ja/chemistry/matter/gases.md`（`status: draft` の雛形）
- `src/content/concepts/concepts.yaml` に概念 `chem.matter.gases` を追記

あとは本文を書いて、下の「公開前のチェック」を通すだけです。

```bash
npm run dev                 # http://localhost:4321/atlas/ja/ で確認
node scripts/validate-content.mjs
```

### 使える分野とカテゴリを調べる

分野やカテゴリを間違えるとコマンドが候補を出して止まります。

```
$ npm run new:article -- --subject chemistry --category typo --slug x --title X

分野 "chemistry" にカテゴリ "typo" はありません。
使えるカテゴリ: matter, atomic-structure, chemical-bonding, chemical-reactions
```

一覧は `src/content/subjects/subjects.yaml` にあります。
**新しいカテゴリが要るときは、先に subjects.yaml に足してください。**

---

## 手で作る場合（GitHub のブラウザ編集など）

コマンドが使えない環境では、既存の記事をコピーして frontmatter を書き換えるのが
確実です。置き場所は必ず次の形にします。

```
src/content/articles/<locale>/<subject>/<category>/<slug>.md
                     └ ja     └ 分野    └ カテゴリ  └ URLに出る名前
```

frontmatter とファイルの置き場所がずれていると検証で止まります。

<details>
<summary>frontmatter のひな形</summary>

```yaml
---
articleId: ja-chemistry-gases # <locale>-<subject>-<slug> の形
locale: ja
title: 気体
slug: gases
subject: chemistry
category: matter
concepts:
  - id: chem.matter.gases # concepts.yaml に実在するIDを書く
authors:
  - atlas-chem-team
reviewers: []
status: draft # draft | in-review | published
createdAt: 2026-07-26
updatedAt: 2026-07-26
summary: 気体の性質と状態方程式を扱います。
difficulty: basic # introductory | basic | intermediate | advanced
estimatedMinutes: 10
tags:
  - 気体
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---
```

</details>

---

## 本文の書き方

### 見出し

**`##` から始めます。** `#` はページ側が記事タイトルとして自動で付けるので、
本文で使うと見出しの段が飛んでしまいます。

```markdown
## 気体の状態方程式

### 理想気体
```

`###` までが右側の目次に出ます。

### 数式

KaTeX を使います。行内は `$...$`、別行立ては `$$...$$`。

**数式の中に日本語を書くときは `\text{}` で囲んでください。**
囲まないと 1 文字ずつ数式用の斜体で組まれ、字間も崩れます。

```markdown
誤: $x = y かつ z = w$
正: $x = y \text{かつ} z = w$

誤: $1\,\mathrm{個}$
正: $1\,\text{個}$
```

`\mathrm{}` は見た目こそ立体になりますが数式モードのままなので、
日本語には使わないでください（ビルド時に警告が出ます）。

化学式は mhchem が使えます: `$\ce{H2O}$`

### 表

Markdown の表がそのまま使えます。ヘッダ行を必ず付けてください。

---

## 概念とのつなぎ方

記事は必ず 1 つ以上の**概念**に紐づきます。概念は言語に依存しない学習項目の単位で、
記事どうしの「前提記事」「関連記事」「次に読む」と学習地図はすべて概念グラフから
自動で作られます。詳しくは [CONCEPT_GRAPH.md](CONCEPT_GRAPH.md)。

新しい概念は `new:article` が自動で作りますが、**関係の線は手で足す必要があります。**

```yaml
- id: chem.matter.gases
  subject: chemistry
  category: matter
  name: { ja: 気体 }
  prerequisites: [chem.matter.phases-of-matter] # これを理解していないと読めない
  recommendedNext: [] # これを読んだ後に進むとよい
  related: [physics.foundations.physical-quantities] # 分野をまたぐ関連も歓迎
  alternatives: []
```

- `prerequisites` は循環させないでください（検証で止まります）
- `related` は**両側に**書きます。記事ページの「関連記事」は自分側しか見ないためです
- 既存の概念を扱う記事なら、新しい概念を作らず既存IDを再利用してください
  （`npm run new:article -- --concept <既存ID> ...`）

---

## 公開前のチェック

```bash
node scripts/validate-content.mjs   # 必須項目・ID重複・概念参照・循環・置き場所
npm run build                       # 本番と同じビルド
npx astro check                     # 型
npm run format:check                # Prettier（崩れていたら npm run format）
```

`status: published` にして PR を出すと、CI が上と同じ検査に加えて
E2E とアクセシビリティ検査（axe）まで走ります。

**`draft` と `in-review` の記事はビルドから除外されます。**
main にマージしても公開されないので、書きかけをマージしても問題ありません。

---

## よくある詰まりどころ

| 症状                                          | 原因と直し方                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `存在しない概念 ... を参照`                   | concepts.yaml にその ID がない。綴りを確認するか概念を追加する             |
| `存在しない分野・カテゴリ ... を指しています` | subjects.yaml に無いカテゴリ。先に subjects.yaml へ追加する                |
| `frontmatter と置き場所が一致しません`        | ファイルを正しいディレクトリへ移動する（frontmatter 側を直してもよい）     |
| 記事が本番に出ない                            | `status` が `published` になっているか確認                                 |
| 見出しが目次に出ない                          | `####` 以下は目次に出ない。`##`〜`###` を使う                              |
| 数式が斜体で崩れる                            | 日本語を `\text{}` で囲む                                                  |
| ビルドで KaTeX の警告が出る                   | 数式モードに日本語が残っている。`node scripts/fix-math-japanese.mjs --dry` |

---

## 準備中の記事に「執筆中」を出す

まだ本文がない記事は `src/data/planned-articles.json` で管理しています。
`progress` を `in-progress` にすると、分野ページ・カテゴリページ・トップの
「近日公開予定」で **執筆中** の印が付きます。省略時は **未着手** です。

```json
{
  "subject": "mathematics",
  "category": "set-theory",
  "title": { "ja": "集合族", "en": "Families of Sets" },
  "order": 3,
  "progress": "in-progress"
}
```

指定できるのは `not-started` と `in-progress` の2つだけで、
それ以外を書くと `node scripts/validate-content.mjs` が止めます。

本文ができたら、この項目を消して通常の記事として追加してください。

## 学習の記録の段階を増やす

読者側の「読んだ／理解した」は `src/lib/history.ts` の `HISTORY_STAGES` に
並んでいます。**手前から順に並べる**決まりで、後ろの段階は手前を含みます
（「理解した」なら「読んだ」も達成済み）。

段階を足すときはこの配列に追加し、表示名を `src/lib/i18n.ts` に足すだけです。
記事ページのトグル・学習の記録ページの絞り込みと件数は、いずれもこの配列を
見て描いているので、他を触る必要はありません。

```ts
export const HISTORY_STAGES = [
  { id: "skimmed", labelKey: "markSkimmed", icon: "○" },
  { id: "read", labelKey: "markRead", icon: "✓" },
  { id: "understood", labelKey: "markUnderstood", icon: "◎" },
] as const;
```

`id` は localStorage に保存される値なので、公開後は変えないでください。

## 記事を消す・移す

- **消す**: ファイルを削除し、その概念を参照する記事が他になければ
  concepts.yaml からも概念を消します。他記事の `prerequisites` などから
  参照されていると検証で止まるので、そちらも直します
- **URL を変える**: `slug` を変えてファイル名も揃えます。
  公開済みの URL を変えると外部リンクが切れるので、必要ならリダイレクトを
  `public/_headers` と同じ要領で `public/_redirects` に足してください
- **`articleId` は変えないでください**。「あとで読む」の保存キーに使っています
