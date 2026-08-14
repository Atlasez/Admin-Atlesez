# 記事編集ワークスペース

`/admin/editor` は、公開学習サイトとは分離された運営者向けの執筆・査読画面です。
Google OAuthでログインし、既存の `report_admin_permissions` に設定された担当分野だけを扱えます。`*` は全分野です。

## できること

- 新規記事の下書き、または公開済みMarkdownを下書きとして取り込む
- Markdown本文を編集し、`$...$` / `$$...$$` の数式をKaTeXまたはMathJaxで即時プレビューする
- 原稿単位でコメントを残し、`下書き → 査読中 → 承認済み` を共有する
- 承認後、公開サイトの形式に合うMarkdown原稿をクリップボードへ出力する

原稿とコメントはD1の `editorial_documents` / `editorial_comments` に保存されます。
公開済み記事のMarkdownや公開サイトの表示は、この操作だけでは変更されません。

## 現在の公開手順

1. ワークスペースで原稿を`承認済み`にする
2. **公開用Markdownをコピー**を押す
3. GitHub上で `src/content/articles/jpn/<分野>/<カテゴリ>/<slug>.md` を作成・更新し、Pull Requestを出す
4. CIが通り、査読者がマージすると本番サイトへ自動デプロイされる

この方式により、執筆・数式確認・査読は内部サイトに集約しつつ、公開履歴と最終レビューはGitHubのPRに残せます。

## 将来のワンクリック公開

「承認済み」から自動でPRを作るには、管理Workerへ**GitHub App**を接続します。個人アクセストークンを画面へ入力する設計にはしません。

必要になるものは次の3点です。

1. `mitukx/Atlasez01` のContents read/write とPull requests read/writeだけを許可したGitHub App
2. Cloudflare WorkersのSecretへ入れるApp ID・Installation ID・Private Key
3. Workerで短命のInstallation Tokenを作り、専用ブランチとPRを作成する処理

この追加後も、原稿・コメント・分野権限のデータモデルはそのまま使えます。

## ローカル確認

```bash
npm run build
npx wrangler d1 migrations apply atlasez-reports-local --local --config wrangler.admin.local.jsonc
npm run dev:admin
```

`http://localhost:8787/admin/editor` を開きます。ローカル設定では開発専用の全分野権限を使うため、Googleログインは不要です。`wrangler.admin.local.jsonc` の `ADMIN_AUTH_MODE: local` はlocalhost以外では無効になり、本番用の `wrangler.admin.jsonc` には含めません。
