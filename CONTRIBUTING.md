# コントリビューションガイド

Atlasezのサイトへの貢献ありがとうございます。記事執筆・査読・翻訳・開発のどれでも歓迎します。

## 記事の執筆・翻訳

1. [docs/CONTENT_MODEL.md](docs/CONTENT_MODEL.md) でfrontmatterの書き方を確認
2. `src/content/articles/<locale>/<subject>/<category>/<slug>.md` を作成（`status: draft`）
3. PRを作成 → CIの検証が通ることを確認 → 査読を受ける
4. 詳細は [docs/EDITORIAL_WORKFLOW.md](docs/EDITORIAL_WORKFLOW.md)

GitHubのブラウザ編集だけで完結できます。ローカル環境は必須ではありません。

## 開発

```bash
npm install
npm run dev
```

PR前チェック: `npm run check && npm run lint && npm run format:check && npm test && node scripts/validate-content.mjs`

- ブランチ名: `article/<articleId>` / `feature/<name>` / `fix/<name>`
- コミットは日本語・英語どちらでも可。何を・なぜ変えたかを書く
- UIを変更する場合は `docs/DESIGN_DECISIONS.md` の原則（簡素・アクセシブル・色は最小限）に従う

## 記事コンテンツのライセンス

記事の投稿にあたっては、団体が定めるコンテンツライセンス（CC BY-SA 4.0を予定・検討中）での
公開に同意したものとみなします。他者の著作物（図・文章）を含める場合は出典と許諾を明記してください。

## 行動規範

[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) に従ってください。

## GitHubラベル

すべてのIssueとPRに、対象サイトのラベルを付けます。

- 運営サイト（`https://admin.atlasez.org`）は `site:admin`
- 学習サイト（`https://atlasez.org`、`https://www.atlasez.org`）は `site:learning`
- 両方に影響する変更は両方のラベルを付けます。

ドキュメント、インフラ、共通コードの変更も、影響するサイトに応じてラベルを選びます。`bug`や`enhancement`などの分類ラベルも必要に応じて追加できますが、サイトラベルの代わりにはなりません。

Issueは対象サイトのフォームを使い、サイトラベルを自動付与します。PRは作成時にGitHub上で該当するサイトラベルを付けます。変更の対象範囲が変わった場合はラベルも更新します。
