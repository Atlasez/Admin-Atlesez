# サイト全体の管理・引き継ぎマニュアル

この文書は、開発者・編集者が交代しても、Atlasez公式サイトと学習サイト
「アトラス」を継続して管理できるようにするための総合マニュアルです。

記事を1本追加するだけなら [ADDING_ARTICLES.md](ADDING_ARTICLES.md)、
公開作業だけなら [PUBLISH.md](PUBLISH.md) を先に読んでも構いません。
この文書では、リポジトリ全体の構成、データの責任範囲、日常作業、検証、
公開、復旧、将来の大規模化までをまとめます。

---

## 1. 最初に理解すること

このリポジトリには、次の2つのサイトが入っています。

1. **Atlasez公式サイト**（`/`）
2. **学習サイト「アトラス」**（`/atlas/ja/`）

どちらもAstroで静的HTMLとして生成されます。記事や設定はGitHubで管理し、
CI成功後に正しいCloudflare Workerへデプロイします。
本番のWorkerと復旧手順は[ADMIN_KNOWLEDGE_BASE.md](ADMIN_KNOWLEDGE_BASE.md)を正本とします。

```text
編集者がファイルを変更
  → GitHubへPull Request
  → GitHub Actionsが自動検査
  → レビュー・マージ
  → 正規のnpmデプロイコマンドでWorkerへ公開
```

記事・画面・設定はGitHub上のファイルが正本です。
応募・コメント・統計などの動的データはCloudflare D1が正本です。

---

## 2. 管理を引き継ぐために必要な権限

最低限、次の権限を引き継いでください。

| 対象                           | 必要な権限                 | 用途                                         |
| ------------------------------ | -------------------------- | -------------------------------------------- |
| GitHub `Atlasez/Admin-Atlesez` | Write以上                  | ブランチ、PR、Issue、マージ                  |
| GitHubリポジトリ設定           | Admin                      | ブランチ保護、Actions、共同管理者の追加      |
| Cloudflare                     | 対象プロジェクトの編集権限 | ビルド状況、環境変数、ドメイン、ロールバック |
| 独自ドメイン管理サービス       | DNS編集権限                | ドメイン更新、DNS変更                        |

個人のパスワードやAPIトークンをMarkdownへ書かないでください。権限は各サービスの
メンバー招待機能で渡します。退任者の個人アカウントだけに本番権限を残さないでください。

引き継ぎ時には、次を実際に確認します。

- [ ] GitHubで新しいブランチをpushできる
- [ ] Pull Requestを作成・レビュー・マージできる
- [ ] GitHub Actionsのログを閲覧できる
- [ ] Cloudflareの最新デプロイと環境変数を閲覧できる
- [ ] ドメインの更新期限と支払方法を確認した
- [ ] 緊急時に前のデプロイへ戻せる

---

## 3. ローカル環境を準備する

必要なものはGit、Node.js、npmです。Node.jsの版はリポジトリ直下の`.nvmrc`を
使用します。

```bash
git clone https://github.com/Atlasez/Admin-Atlesez.git
cd Admin-Atlesez
npm ci
npm run dev
```

ブラウザで次を開きます。

- 公式サイト: `http://localhost:4321/`
- 学習サイト: `http://localhost:4321/atlas/ja/`

作業前には必ず`main`を更新し、作業用ブランチを作ります。

```bash
git switch main
git pull --ff-only
git switch -c feature/変更内容
```

`main`へ直接pushせず、Pull Requestを通してください。

---

## 4. リポジトリ全体の構成

```text
.
├── .github/workflows/       GitHub Actions（自動検査）
├── docs/                    管理・設計・執筆資料
├── public/                  そのまま配信する画像・ヘッダー設定など
├── scripts/                 記事作成、検証、移行、一括修正
├── src/
│   ├── components/          再利用するUI部品
│   ├── content/             記事・分野・概念・お知らせ・プロジェクト
│   ├── data/                近日公開記事などの補助データ
│   ├── layouts/             公式サイト・学習サイトの共通枠
│   ├── lib/                 データ取得、関連計算、URL生成、保存処理
│   ├── pages/               URLに対応するページ
│   └── styles/              全体のCSSとデザイントークン
├── tests/
│   ├── e2e/                 ブラウザ・アクセシビリティ検査
│   └── unit/                ロジックの単体テスト
├── astro.config.mjs         Astro、URL、配信パスの設定
├── src/content.config.ts    コンテンツの入力規則
├── package.json             コマンドと依存パッケージ
└── playwright.config.ts     E2Eテスト設定
```

### 変更目的からファイルを探す

| 変更したいもの                 | 主な場所                                                     |
| ------------------------------ | ------------------------------------------------------------ |
| 学習記事                       | `src/content/articles/`                                      |
| 分野・カテゴリ・準備中表示     | `src/content/subjects/subjects.yaml`                         |
| 記事同士の前提・関連・推奨順   | `src/content/concepts/concepts.yaml`                         |
| 近日公開予定の記事             | `src/data/planned-articles.json`                             |
| 公式サイトのお知らせ           | `src/content/news/`                                          |
| 公式サイトのプロジェクト       | `src/content/projects/projects.yaml`                         |
| 学習サイトのヘッダー・フッター | `src/layouts/AtlasLayout.astro`                              |
| 公式サイトのヘッダー・フッター | `src/layouts/OrgLayout.astro`                                |
| 学習地図                       | `src/components/LearningMap.astro`                           |
| 表示設定                       | `src/components/A11ySettings.astro`、`SettingsMenu.astro`    |
| 記事ページ                     | `src/pages/atlas/[locale]/[subject]/[category]/[slug].astro` |
| 色・余白・文字サイズ           | `src/styles/tokens.css`                                      |
| 共通要素の見た目               | `src/styles/base.css`                                        |
| UIの日本語・英語ラベル         | `src/lib/i18n.ts`                                            |
| UI表示言語                     | `src/lib/ui-locales.ts`                                      |
| 本番URL・BASE_PATH             | `astro.config.mjs`、Cloudflare環境変数                       |

---

## 5. コンテンツの正本と役割

### 5.1 分野とカテゴリ

正本は`src/content/subjects/subjects.yaml`です。

```yaml
- slug: mathematics
  name: { ja: 数学, en: Mathematics }
  status: published
  order: 10
  group: natural
  genre: mathematical-information
  description: { ja: 数学を学ぶ分野です。 }
  introSlug: what-is-mathematics
  categories:
    - id: set-theory
      slug: set-theory
      name: { ja: 集合論, en: Set Theory }
      order: 10
      entryConceptIds: [math.set-theory.sets]
      relatedCategoryIds: [group-theory]
```

分野の`status`は次の2つです。

| 値          | 意味                                         |
| ----------- | -------------------------------------------- |
| `published` | 公開中。分野ページや記事への導線を出す       |
| `preparing` | 準備中。名称は出すが未完成ページへ誘導しない |

新しい記事で未登録のカテゴリを使うことはできません。必ず先にこのファイルへ
カテゴリを追加してください。

`slug`はURLや他データから参照されます。公開後は軽い気持ちで変更しないでください。

### 5.2 学習記事

記事は次の規則で置きます。

```text
src/content/articles/<locale>/<subject>/<category>/<slug>.md
```

例:

```text
src/content/articles/ja/mathematics/set-theory/sets.md
```

記事の先頭にはfrontmatterがあります。

```yaml
---
articleId: ja-mathematics-sets
locale: ja
title: 集合
slug: sets
subject: mathematics
category: set-theory
concepts:
  - id: math.set-theory.sets
authors: [atlas-mathematics-team]
reviewers: []
status: draft
createdAt: 2026-07-29
updatedAt: 2026-07-29
summary: 集合の定義と基本的な表し方を説明します。
difficulty: basic
estimatedMinutes: 10
tags: [集合]
aliases: []
exerciseIds: { pre: [], post: [] }
references: []
---
```

記事の`status`は次の3つです。

| 値          | 意味         | 本番表示   |
| ----------- | ------------ | ---------- |
| `draft`     | 執筆中       | 表示しない |
| `in-review` | 査読・確認中 | 表示しない |
| `published` | 公開承認済み | 表示する   |

重要な識別子:

- `articleId`: 読者の「あとで読む」「読んだ・理解した」の保存にも使う永続ID
- `slug`: URLの一部
- `concepts[].id`: 記事が説明する概念

**公開済みの`articleId`は変更しないでください。** 変更すると読者の端末に保存された
学習記録と記事の対応が切れます。

`slug`を変える場合はURLが変わるため、外部リンクと検索評価を守るためのリダイレクトを
検討してください。

### 5.3 概念と記事同士の関係

正本は`src/content/concepts/concepts.yaml`です。

```yaml
- id: math.linear-algebra.vector-space
  subject: mathematics
  category: linear-algebra
  name: { ja: 線形空間, en: Vector Spaces }
  prerequisites: [math.set-theory.mappings]
  recommendedNext: [math.linear-algebra.linear-map]
  related: [math.group-theory.group-definition]
  alternatives: []
```

| 項目              | 意味               | 主な表示               |
| ----------------- | ------------------ | ---------------------- |
| `prerequisites`   | 先に理解すべき概念 | 前提記事、学習経路     |
| `recommendedNext` | 次に進むとよい概念 | 次に読む記事           |
| `related`         | 順序を伴わない関連 | 関連記事、地図         |
| `alternatives`    | 別の説明・別経路   | 学習経路の候補         |
| `partOf`          | 親概念・包含       | 将来用。現状ほぼ未使用 |

記事名やURLではなく永続的な概念IDで結ぶため、題名を変更しても関係は維持されます。
記事ページの前提・関連・次の記事、学習地図、経路検索はこのデータから生成されます。

運用上の注意:

- `prerequisites`を循環させない
- `related`は両方の概念に書く
- 掲載順を表すだけの線を`recommendedNext`へ入れない
- 既存概念を扱う記事では概念IDを再利用する
- 公開した概念IDは変更しない

詳細は[CONCEPT_GRAPH.md](CONCEPT_GRAPH.md)を参照してください。

### 5.4 本文がまだない公開予定記事

正本は`src/data/planned-articles.json`です。

```json
{
  "subject": "mathematics",
  "category": "set-theory",
  "title": { "ja": "集合族", "en": "Families of Sets" },
  "order": 3,
  "progress": "in-progress"
}
```

| `progress`              | 意味   |
| ----------------------- | ------ |
| 省略または`not-started` | 未着手 |
| `in-progress`           | 執筆中 |

本文が完成したら、通常の記事ファイルを追加したうえで予定記事から同じ項目を削除します。
残したままだと検証が重複を検出します。

### 5.5 お知らせ

`src/content/news/<日付またはID>.md`へ追加します。

- `status: draft`: 本番に出さない
- `status: published`: 本番に出す
- `date`: 一覧の掲載日
- `category`: `announcement`、`report`、`release`

### 5.6 プロジェクト

`src/content/projects/projects.yaml`で管理します。

- `active`: 活動中
- `preparing`: 準備中
- `archived`: 終了・アーカイブ

表示順は`order`で決まります。

### 5.7 読者ごとの学習記録

「あとで読む」「読んだ」「理解した」や表示設定は、サーバーではなく読者のブラウザの
`localStorage`に保存されます。

| データ           | 主な実装                                              |
| ---------------- | ----------------------------------------------------- |
| あとで読む       | `src/lib/bookmarks.ts`                                |
| 読んだ・理解した | `src/lib/history.ts`                                  |
| 表示設定         | `src/components/A11ySettings.astro`、`BaseHead.astro` |

管理者が全読者の記録を閲覧する機能や、端末間の自動同期はありません。
ログイン機能を追加するまでは、この仕様を前提にしてください。

---

## 6. 日常的な管理作業

### 6.1 記事を追加する

推奨コマンド:

```bash
npm run new:article -- \
  --subject chemistry \
  --category matter \
  --slug gases \
  --title 気体
```

このコマンドは次を行います。

1. 正しいディレクトリへ`status: draft`の記事雛形を作る
2. 概念がなければ`concepts.yaml`へ追加する
3. `articleId`、日付、基本項目を規則に沿って埋める

作成後に必ず行うこと:

1. 本文を書く
2. `summary`を定型文から具体的な要約へ直す
3. `difficulty`と`estimatedMinutes`を見直す
4. 概念の前提・関連・次の項目を設定する
5. `updatedAt`を更新する
6. 査読時に`reviewers`を追加する
7. 公開承認後に`status: published`へ変更する

詳細は[ADDING_ARTICLES.md](ADDING_ARTICLES.md)を参照してください。

### 6.2 記事を修正する

- 誤字修正でも`updatedAt`を更新する
- 内容が変わる修正は再査読する
- `articleId`は維持する
- URLを変えないなら`slug`とファイル名は維持する
- 前提知識が変わったら`concepts.yaml`も確認する
- 題名を変更したら検索結果、関連記事、近日公開データとの重複を確認する

### 6.3 記事を削除する

1. 記事Markdownを削除する
2. 他の記事が同じ概念を説明しているか確認する
3. 不要になった概念を削除する場合は、他概念からの参照も削除する
4. 外部公開済みURLなら、適切な後継ページへリダイレクトする
5. `node scripts/validate-content.mjs`を実行する
6. `npm run build`とリンク検査を実行する

概念が他から参照されている場合、検証スクリプトが参照切れを検出します。

### 6.4 新しい分野・カテゴリを追加する

1. `subjects.yaml`へ分野またはカテゴリを追加
2. 重複しない`slug`と`order`を設定
3. 必要な概念を`concepts.yaml`へ追加
4. 入口概念を`entryConceptIds`へ設定
5. 最初は`status: preparing`にする
6. 分野ページ・地図・検索・スマホ表示を確認
7. 公開準備が整ってから`published`にする

分類の`group`と`genre`は`src/lib/taxonomy.ts`の定義に従います。

### 6.5 関連記事や学習経路を変更する

記事本文へ関連記事リンクを直接並べるのではなく、原則として
`concepts.yaml`の関係を直します。

変更後は以下を確認します。

- 記事ページの「前提記事」「関連記事」「次に読む」
- 学習地図の線とカテゴリ
- 経路検索の順番
- `prerequisites`に循環がないこと

### 6.6 画像・静的ファイルを追加する

公開する画像は`public/images/`へ置き、ページから`/images/...`として参照します。

- ファイル名は英小文字・数字・ハイフンを推奨
- 写真は表示に必要な解像度まで縮小
- 可能ならWebPまたはSVGを使用
- 意味のある画像には適切な代替テキストを付ける
- 個人情報、許諾のない写真、第三者の著作物を置かない

`public/`以下は加工されず、そのままインターネットへ公開されます。

### 6.7 UIやプログラムを変更する

変更範囲の目安:

- 全ページ共通: `layouts/`、`components/`、`styles/`
- URLやページ固有表示: `pages/`
- データ取得・関連計算: `lib/`
- 入力形式: `content.config.ts`

入力形式を変更する場合は、既存の全記事・検証スクリプト・記事作成スクリプト・
ドキュメントを同時に更新してください。

---

## 7. 検証とテスト

### 7.1 最低限の確認

記事やデータだけの変更でも、最低限次を実行します。

```bash
node scripts/validate-content.mjs
npm run check
npm run build
```

### 7.2 Pull Request前の標準確認

```bash
npm run check
npm run lint
npm run format:check
npm test
npm run build
npm run test:e2e
```

数式を変更した場合:

```bash
npm run audit:math
```

内部リンクを本番と同じ状態で確認する場合:

```bash
npm run build
node scripts/check-links.mjs dist /
```

### 7.3 `validate-content.mjs`が検査する内容

- 概念IDの重複
- 存在しない概念への参照
- `prerequisites`の循環
- `articleId`の重複
- 同じURLになる記事の重複
- 記事の必須項目
- 記事が参照する概念の存在
- 分野・カテゴリの存在
- frontmatterとファイルの置き場所の一致
- 予定記事の進捗値
- 予定記事の重複
- 予定記事と既存記事の重複

エラーを無視して検証を削除するのではなく、原因となったデータを直してください。

### 7.4 自動検査

Pull Requestを作ると`.github/workflows/ci.yml`が次を実行します。

- コンテンツ検証
- 数式検査
- Astro・TypeScriptチェック
- ESLint
- Prettier
- 単体テスト
- 本番ビルド
- Pagefind検索インデックス生成
- 内部リンク検査
- E2Eテスト
- axeによるアクセシビリティ検査

CIが失敗しているPRは原則としてマージしません。

---

## 8. GitHubでの作業と公開

### 標準フロー

```bash
git switch main
git pull --ff-only
git switch -c feature/変更内容

# 編集・検証

git status
git diff
git add <今回変更したファイルだけ>
git commit -m "変更内容を簡潔に書く"
git push -u origin feature/変更内容
```

その後、GitHubでPull Requestを作ります。

PR本文には最低限、次を書きます。

- 何を変更したか
- なぜ変更したか
- 利用者への影響
- 実行した検証
- 画面変更がある場合はPC・スマホの確認結果

レビューとCIが完了したらマージします。公開サイトは`npm run deploy:public`、
運営用サイトは`npm run deploy:admin`で正しいCloudflare Workerへ更新します。

詳細は[EDITORIAL_WORKFLOW.md](EDITORIAL_WORKFLOW.md)と
[PUBLISH.md](PUBLISH.md)を参照してください。

---

## 9. Cloudflareと本番環境

本番配信はCloudflare Workersが担当します。GitHub Actionsは検証を行い、
デプロイは正規のnpmコマンドから実行します。

主な環境変数:

| 変数        | 用途                                    |
| ----------- | --------------------------------------- |
| `SITE_URL`  | canonical URL、OGP、sitemapの基準URL    |
| `BASE_PATH` | サブディレクトリ配信時のパス。通常は`/` |

環境変数の値、ドメイン設定、ビルド出力先は
[DEPLOYMENT.md](DEPLOYMENT.md)を参照してください。

本番公開後は最低限、次を確認します。

- 公式トップが開く
- `/atlas/ja/`が開く
- 記事を1本開ける
- 検索結果が出る
- 学習地図が描画される
- PCとスマホでヘッダーが崩れていない
- 最新記事と近日公開記事が表示される
- `robots.txt`とsitemapが本番URLを指す

---

## 10. 障害対応とロールバック

### 本番が開かない

1. Cloudflareの最新ビルド結果を確認
2. GitHub Actionsの結果を確認
3. 直前にマージしたPRを確認
4. ローカルで同じコミットを`npm ci && npm run build`する
5. 原因がすぐ直せなければ、Cloudflareで直前の正常デプロイへ戻す

### 表示はできるが検索だけ動かない

Pagefindインデックス生成または`dist/pagefind/`の配信を確認します。

```bash
npm run build
```

ビルドログに`Pagefind`とインデックス対象件数が出ることを確認してください。

### 記事が表示されない

次を順に確認します。

1. `status: published`か
2. 分野が`published`か
3. ファイルの置き場所とfrontmatterが一致するか
4. `locale`、`subject`、`category`、`slug`に誤りがないか
5. `validate-content.mjs`が成功するか

### 地図に記事が出ない

1. 記事の`concepts[].id`が正しいか
2. `concepts.yaml`に概念があるか
3. 概念の`subject`と`category`が正しいか
4. 記事が`published`か
5. `/atlas/graph.json`が生成されているか

### 元に戻す方法

公開済み変更を取り消す場合は、履歴を消す`reset --hard`ではなく、
GitHubのRevertまたは`git revert <commit>`で取り消しコミットを作ります。
これにより、何を戻したかが履歴に残ります。

---

## 11. 変更してはいけないもの・注意が必要なもの

### 原則変更しない

- 公開済み記事の`articleId`
- 公開済み概念の`id`
- 理由のないURL変更
- `package-lock.json`の手編集
- Git履歴を書き換えるforce push

### コミットしない

- `node_modules/`
- `dist/`
- `.env`
- APIキー、パスワード、個人用トークン
- OSやエディタの一時ファイル

### 個人情報

`src/data/atlas-members.json`には氏名などが含まれています。現在のサイトからは
参照されていません。削除や公開範囲の判断は`docs/BACKLOG.md`に記録されています。
新しい個人情報を追加する前に、本人の同意、利用目的、公開範囲、削除手順を確認してください。

---

## 12. 記事数が大きく増えた場合

記事本文はすでに`言語/分野/カテゴリ`単位で分割されているため、数百から数千記事まで
整理して追加できます。IDと参照の検証も自動化されています。

ただし、現在は次の2つが単一ファイルです。

- `src/content/concepts/concepts.yaml`
- `src/data/planned-articles.json`

記事数・概念数・同時編集者が増えると、次の問題が起きます。

- ファイルが長くなり目的の項目を探しにくい
- 複数PRで同じファイルを編集し、Git競合が増える
- 地図・経路検索の初期HTMLやビルド時間が増える
- レビューで変更範囲を把握しにくい

競合や編集負荷が目立ち始めたら、次のように分野別へ分割します。

```text
src/content/concepts/
  mathematics.yaml
  physics.yaml
  chemistry.yaml

src/data/planned-articles/
  mathematics.json
  physics.json
  chemistry.json
```

分割時には次を同時に変更します。

1. `src/content.config.ts`のローダー
2. `src/lib/content.ts`と`src/lib/planned.ts`
3. `scripts/validate-content.mjs`
4. `scripts/new-article.mjs`
5. 関連する単体・E2Eテスト
6. 本文書と記事追加手順

技術者以外が大量の記事を日常的に更新する段階になった場合は、GitHubのファイル編集だけで
運用し続けるのではなく、入力画面を持つヘッドレスCMSの導入を検討します。
読者の学習履歴を端末間同期する場合は、CMSとは別にログイン・データベース・
プライバシー設計が必要です。

---

## 13. 定期的な保守

### 毎回の変更

- [ ] 作業ブランチを使った
- [ ] 無関係なファイルをコミットしていない
- [ ] `updatedAt`を更新した
- [ ] ローカル検証を通した
- [ ] PRでレビューを受けた
- [ ] CIが成功した

### 月1回程度

- [ ] npm依存関係のセキュリティ通知を確認
- [ ] GitHub Actions失敗の放置がないか確認
- [ ] Cloudflareのデプロイ失敗がないか確認
- [ ] バックログを整理
- [ ] 近日公開記事の進捗を更新
- [ ] リンク切れと検索を確認

### 半年〜年1回

- [ ] Node.js・Astro・主要依存関係の更新計画を立てる
- [ ] ドメイン更新期限と支払情報を確認
- [ ] GitHub・Cloudflareの管理者を複数人確保
- [ ] 不要な権限と退任者アカウントを削除
- [ ] 個人情報を含むファイルを棚卸し
- [ ] 本番からのロールバック手順を実際に確認
- [ ] この文書が現状と一致しているか確認

---

## 14. 引き継ぎ担当者の最初の1週間

1. この文書と`docs/README.md`を読む
2. ローカルでサイトを起動する
3. テスト一式を実行する
4. `draft`の記事を1本追加する練習をする
5. 概念関係を1本追加し、地図と関連記事を確認する
6. テスト用ブランチをpushし、PRとプレビューを確認する
7. Cloudflareで過去のデプロイとロールバック位置を確認する
8. GitHub・Cloudflare・ドメインの権限を確認する
9. 未対応事項を`BACKLOG.md`で確認する
10. 小さな改善PRをレビュー付きでマージする

---

## 15. 関連ドキュメント

| 文書                                                       | 内容                           |
| ---------------------------------------------------------- | ------------------------------ |
| [README.md](README.md)                                     | ドキュメント索引               |
| [ADDING_ARTICLES.md](ADDING_ARTICLES.md)                   | 記事追加の実作業               |
| [CONTENT_MODEL.md](CONTENT_MODEL.md)                       | frontmatterとデータ構造        |
| [CONCEPT_GRAPH.md](CONCEPT_GRAPH.md)                       | 前提・関連・地図・経路検索     |
| [EDITORIAL_WORKFLOW.md](EDITORIAL_WORKFLOW.md)             | 執筆・査読・公開の人の流れ     |
| [PUBLISH.md](PUBLISH.md)                                   | 公開前後のチェック             |
| [DEPLOYMENT.md](DEPLOYMENT.md)                             | Cloudflare、環境変数、ドメイン |
| [ACCESSIBILITY.md](ACCESSIBILITY.md)                       | WCAG 2.2 AAの方針              |
| [INFORMATION_ARCHITECTURE.md](INFORMATION_ARCHITECTURE.md) | URLとサイト構造                |
| [BACKLOG.md](BACKLOG.md)                                   | 未着手の課題                   |

---

## 16. この文書の更新ルール

次の変更をしたPRでは、この文書も同じPRで更新してください。

- ディレクトリ構成を変えた
- frontmatterやステータスを変えた
- 記事・概念・予定記事の保存場所を変えた
- テストコマンドを変えた
- デプロイ先や環境変数を変えた
- 管理権限や引き継ぎ方法を変えた
- CMS、ログイン、データベースを導入した

コードと文書が食い違うと引き継ぎに失敗します。コード変更の完了条件に
「管理文書が現仕様と一致していること」を含めてください。
