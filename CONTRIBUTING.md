# コントリビューションガイド

Atlasezのサイトへの貢献ありがとうございます。記事執筆・査読・翻訳・開発のどれでも歓迎します。

初めてコードを変更する人やLLMは、先に [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md) と
ルートの [AGENTS.md](AGENTS.md) を読んでください。サイトごとの責任範囲、運営データと記事データの境界、
認証・個人情報の扱い、ローカルWorkerの起動方法をまとめています。

## 記事の執筆・翻訳

1. [docs/CONTENT_MODEL.md](docs/CONTENT_MODEL.md) でfrontmatterの書き方を確認
2. `src/content/articles/<ISO 639-3>/<subject>/<category>/<slug>.md` を作成（日本語は `jpn`、`status: draft`）
3. PRを作成 → CIの検証が通ることを確認 → 査読を受ける
4. 詳細は [docs/EDITORIAL_WORKFLOW.md](docs/EDITORIAL_WORKFLOW.md)

GitHubのブラウザ編集だけで完結できます。ローカル環境は必須ではありません。

## 開発

```bash
npm install
npm run dev
```

PR前チェック: `npm run check && npm run lint && npm run format:check && npm test && node scripts/validate-content.mjs`

UI、Worker、D1、学習地図を変更した場合は、変更範囲に応じて `npm run build`、`npm run test:e2e`、
`git diff --check` も実行してください。D1は既存migrationを書き換えず、新しい連番migrationを追加します。

- ブランチ名: `article/<articleId>` / `feature/<name>` / `fix/<name>`
- コミットは日本語・英語どちらでも可。何を・なぜ変えたかを書く
- UIを変更する場合は `docs/DESIGN_DECISIONS.md` の原則（簡素・アクセシブル・色は最小限）に従う
- Secret、OAuth情報、Discord token/webhook、個人情報、本番D1の内容をコミットしない

## 記事コンテンツのライセンス

記事の投稿にあたっては、団体が定めるコンテンツライセンス（CC BY-SA 4.0を予定・検討中）での
公開に同意したものとみなします。他者の著作物（図・文章）を含める場合は出典と許諾を明記してください。

## 行動規範

[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) に従ってください。
