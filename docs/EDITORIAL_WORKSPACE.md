# 記事編集ワークスペース

`/admin/editor` は、公開学習サイトとは分離された運営者向けの執筆・査読画面です。
Google OAuthでログインし、既存の `report_admin_permissions` に設定された担当分野だけを扱えます。`*` は全分野です。

## できること

- 新規記事の下書き、または公開済みMarkdownを下書きとして取り込む
- Markdown本文を編集し、`$...$` / `$$...$$` の数式をKaTeXで即時プレビューする
- 原稿を保存した後、画像をアップロードして本文へ挿入する
- TikZ/LaTeXのソースブロックを挿入し、査読プレビューで確認する
- 原稿単位でコメントを残し、`下書き → 査読中 → 承認済み` を共有する
- 承認後、管理者が「公開する」を押して本文と画像を公開先へ反映する

原稿とコメントはD1の `editorial_documents` / `editorial_comments` に保存されます。画像素材はD1の `editorial_assets` に原稿単位で保存され、公開時にGitHubへ同期されます。詳細は [記事素材・LaTeX/TikZ運用](EDITORIAL_MEDIA_AND_LATEX.md) を参照してください。
公開済み記事のMarkdownや公開サイトの表示は、この操作だけでは変更されません。

## 現在の公開手順

1. ワークスペースで原稿を`承認済み`にする
2. 運営管理者が**公開する**を押す
3. Workerが `Atlasez/Atlasez01` の `src/content/articles/ja/<分野>/<カテゴリ>/<slug>.md` と画像素材を更新する
4. GitHub Actions / Cloudflare Pagesのビルドが完了すると公開サイトへ反映される

この方式により、執筆・数式確認・査読は内部サイトに集約しつつ、公開本文と画像はGitHubの履歴に残せます。公開前の最終承認は、既存の査読状態と管理者権限で制限します。

## GitHub連携の設定

公開には管理Workerへ**GitHub Fine-grained token**をSecretとして登録します。個人アクセストークンを画面へ入力する設計にはしません。

必要になるものは次の2点です。

1. `Atlasez/Atlasez01` のContents read/writeだけを許可したFine-grained token
2. Cloudflare WorkersのSecret `GITHUB_PUBLISH_TOKEN` と、必要に応じて変数 `GITHUB_REPOSITORY=Atlasez/Atlasez01`

Secretが未設定の場合、保存・査読までは利用できますが、公開操作はエラーになります。

## ローカル確認

```bash
npm run build
npx wrangler d1 migrations apply atlasez-reports-local --local --config wrangler.admin.local.jsonc
npm run dev:admin
```

`http://localhost:8787/admin/editor` を開きます。ローカル設定では開発専用の全分野権限を使うため、Googleログインは不要です。`wrangler.admin.local.jsonc` の `ADMIN_AUTH_MODE: local` はlocalhost以外では無効になり、本番用の `wrangler.admin.jsonc` には含めません。

## 同時編集WorkerとPR Preview

Cloudflare WorkersはDurable Objectを実装するWorkerにPreview URLを生成しないため、同時編集処理は非公開の`atlasez-editorial-collaboration` Workerへ分離しています。運営サイト本体は外部Durable Object bindingでこのWorkerを参照するため、同時編集を維持したままPRごとのPreview URLを発行できます。

同時編集Workerのコードまたは設定を変更した場合は、運営サイト本体より先に次を実行してください。

```sh
npm run deploy:admin:collaboration
```

通常のローカル開発では`wrangler.admin.local.jsonc`が同じクラスをローカルDurable Objectとして起動するため、従来どおり`npm run dev:admin`だけで確認できます。
