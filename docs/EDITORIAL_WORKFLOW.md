# 執筆・査読フロー（EDITORIAL_WORKFLOW）

承認済みHTMLの手動コピーは行わない。すべてGit/PRベースで管理する。

記事ファイルの作り方そのものは [ADDING_ARTICLES.md](ADDING_ARTICLES.md) を参照。
ここでは人の動き（ブランチ・査読・公開）だけを扱う。

## 1. 記事を書く（執筆者）

1. `article/<articleId>` ブランチを作成（GitHub Web UIの鉛筆アイコンからでも可）
2. 記事を作成する
   - 手元にNode環境があるなら `npm run new:article -- --subject <分野> --category <カテゴリ> --slug <URL名> --title <記事名>`
     が雛形と概念をまとめて用意する
   - ブラウザ編集だけで進めるなら、既存記事をコピーしてfrontmatterを書き換える
   - どちらも `status: draft` で開始する
   - 詳しくは [ADDING_ARTICLES.md](ADDING_ARTICLES.md)
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

## 3. フィードバック（査読者）

1. 運営サイトの編集画面からフィードバック依頼を作成する
2. 運営内タスクとして内容を確認し、修正後に担当タスクを「完了」にする
3. 記事に紐づく全フィードバック依頼が完了したら、執筆者が「フィードバック完了・公開審査へ」を押す
4. 分野統括、プロジェクトリーダーの順に運営サイトで公開審査を行う

運営サイトの状態は `draft`（執筆中）→ `in-review`（フィードバック中）→
公開審査→ `approved`（公開準備完了）で進み、公開用PRのMerge後に学習サイト側の
Markdownが `status: published` となる。draft / in-review はビルドから除外されるため、
**mainにマージされていても公開されない**。

## 4. 公開

公開審査の完了後、原稿は「公開準備完了」になり、運営管理者へ公開待ち通知が届く。運営管理者が編集画面の「公開する」を押すと、Workerが
`Atlasez/Atlasez01` に公開用PRを作成する。公開ボタンはmainやCloudflareへ直接書き込まない。
学習サイトの本番は同リポジトリの`main`をProduction branchとするCloudflare Workers Buildsで自動ビルドされるため、CI・差分確認後にPRをMergeすると反映される。公開状態は5分ごとにGitHubのmainと同期する。

## 5. 修正・報告対応

- 読者からの報告は記事ページ「問題を報告」→ GitHub Issue
- 軽微な修正（誤字）は直接PR。内容の変更は再査読を必要とする
- 修正時は `updatedAt` を更新する

## 6. 翻訳（現在は停止中）

英語版は翻訳が4記事しかなく日本語版との差が大きすぎたため、2026-07-26に取り下げた。
仕組みは残してあるので、再開する場合は次の手順になる。

1. `src/lib/i18n.ts` の `LOCALES` に `"en"` を戻す
2. 対象概念を確認し、翻訳先言語で自然な記事構成を決める（一対一の直訳でなくてよい）
3. 新しい記事として通常フローで執筆（`locale` を変え、同じ概念IDを `concepts` に指定）
4. 概念IDが共有されていれば、言語切替リンクと `hreflang` は自動生成される
