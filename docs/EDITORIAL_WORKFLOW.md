# 執筆・査読フロー（EDITORIAL_WORKFLOW）

承認済みHTMLの手動コピーは行わない。すべてGit/PRベースで管理する。

## 1. 記事を書く（執筆者）

1. `article/<articleId>` ブランチを作成（GitHub Web UIの鉛筆アイコンからでも可）
2. `src/content/articles/<locale>/<subject>/<category>/<slug>.md` を作成
   - テンプレート: 既存記事をコピーし、frontmatterを書き換える
   - `status: draft` で開始
   - 新しい概念が必要なら `src/content/concepts/concepts.yaml` に追記
3. Pull Requestを作成

非エンジニアの参加: GitHubのブラウザ編集のみで完結する。Markdownとfrontmatterの書き方は `docs/CONTENT_MODEL.md` を参照。

## 2. 自動検証（CI）

PRごとに自動実行される（`.github/workflows/ci.yml`）。

- スキーマ検証（Zod・必須フィールド）
- 概念参照・重複ID・prerequisite循環検査
- 内部リンク検証
- 型チェック・lint・formatチェック・単体テスト
- ビルド・アクセシビリティ検査（axe）

CIが赤のうちはマージできない（mainブランチ保護を設定すること）。

## 3. 査読（査読者）

1. PRの差分と、CIビルドのプレビューで内容を確認
2. 正確性・分かりやすさ・前提関係の妥当性をレビューコメントで指摘
3. 承認時: frontmatterの `reviewers` に査読者名を追加し、`status: published` へ変更
4. PRをApproveしてマージ

`status` の使い分け: `draft`（執筆中）→ `in-review`（査読依頼中）→ `published`（公開）。
draft / in-review はビルドから除外されるため、**mainにマージされていても公開されない**。

## 4. 公開

mainへのマージでGitHub Actionsが自動ビルド・デプロイする。手作業は不要。

## 5. 修正・報告対応

- 読者からの報告は記事ページ「問題を報告」→ GitHub Issue
- 軽微な修正（誤字）は直接PR。内容の変更は再査読を必要とする
- 修正時は `updatedAt` を更新する

## 6. 翻訳

1. 対象概念を確認し、翻訳先言語で自然な記事構成を決める（一対一の直訳でなくてよい）
2. 新しい記事として通常フローで執筆（`locale` を変え、同じ概念IDを `concepts` に指定）
3. 概念IDが共有されていれば、言語切替リンクと `hreflang` は自動生成される
