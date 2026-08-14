# Atlasez01 (atlasez-web)

学生団体 **Atlasez** の公式サイト、学習サイト **「アトラス」**、メンバー用サイト、
学習サイト運営用サイトを一つのモノレポで管理しています。Astroで公開ページを生成し、
Cloudflare Worker + D1で認証付きの運営機能とAPIを提供します。

- 公式サイト: `/`（団体紹介・プロジェクト・お知らせ・運営募集）
- 学習サイト: `/atlas/ja/`（記事・学習地図・検索・表示設定・運営紹介）
- メンバー用サイト: `/admin/portal/`（参加プロジェクトと横断ToDo）
- 学習サイト運営用サイト: `/admin/atlas/`（原稿・査読・問題報告・進捗）

## 引き継ぎ用の入口

全体像、どのファイルを直すか、D1・認証・Discordの扱い、テストとデプロイ手順は
[開発・引き継ぎガイド](docs/DEVELOPMENT_GUIDE.md)にまとめています。LLMや自動化エージェントは
作業前にルートの [AGENTS.md](AGENTS.md) も読んでください。
記事を書く人向けの操作は [記事を書く人向けガイド](docs/ADMIN_GUIDE.md) を参照してください。

---

## はじめての人へ

やりたいことが決まっているなら、**[docs/README.md](docs/README.md) の索引**から探すのが早いです。

| 目的                                   | まず読む文書                                                         |
| -------------------------------------- | -------------------------------------------------------------------- |
| サイト全体を引き継ぐ                   | [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md)               |
| 記事を書く人向けの運営サイトを使う     | [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md)                            |
| リポジトリを分割・移行する             | [docs/REPOSITORY_BOUNDARIES.md](docs/REPOSITORY_BOUNDARIES.md)       |
| ナビゲーションやサイトの境界を理解する | [docs/INFORMATION_ARCHITECTURE.md](docs/INFORMATION_ARCHITECTURE.md) |
| 本番へ公開する                         | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)                             |

- **記事を追加したい** → [docs/ADDING_ARTICLES.md](docs/ADDING_ARTICLES.md)
- **公開まわりを触りたい** → [docs/PUBLISH.md](docs/PUBLISH.md) / [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **学習地図の仕組みを知りたい** → [docs/CONCEPT_GRAPH.md](docs/CONCEPT_GRAPH.md)

## クイックスタート

```bash
npm ci             # 依存導入（Node は .nvmrc の 22）
npm run dev        # 開発サーバー http://localhost:4321
npm run build      # 本番ビルド（dist/）＋検索インデックス生成
npm run preview    # ビルド結果の確認
```

## 主なコマンド

```bash
npm run new:article -- --subject chemistry --category matter --slug gases --title 気体
                           # 記事の雛形と概念を作る

npm run check              # TypeScript / Astro の型チェック
npm run lint               # ESLint
npm run format             # Prettier（確認だけなら format:check）
npm test                   # 単体テスト（Vitest）
npm run test:e2e           # E2E + axe（要: npm run build と npx playwright install）

node scripts/validate-content.mjs      # コンテンツ検証
node scripts/check-links.mjs dist /    # 内部リンク検証
```

スクリプトの全一覧は [docs/README.md](docs/README.md) にあります。

## ディレクトリ

```text
src/
├── content/        # ★ コンテンツ（概念・記事・お知らせ・プロジェクト・分野）
│   ├── concepts/concepts.yaml   # 概念グラフ（学習地図と記事間リンクの元）
│   ├── subjects/subjects.yaml   # 分野とカテゴリの定義
│   └── articles/jpn/<分野>/<カテゴリ>/<slug>.md
├── pages/          # ルーティング（/ = 公式, /atlas/ = 学習サイト）
├── layouts/        # OrgLayout / AtlasLayout
├── components/     # 共通UI（BaseHead, Breadcrumb, A11ySettings, ThemeToggle）
├── lib/            # 概念グラフ・i18n・URL・デプロイ判定・ブックマーク
└── styles/         # デザイントークンと基本スタイル
public/             # 静的ファイル。_headers は Cloudflare Pages の設定
scripts/            # 検証・一括修正・記事の足場
tests/              # unit (Vitest) / e2e (Playwright + axe)
docs/               # ドキュメント（docs/README.md が索引）
versions/           # 過去バージョンのスナップショット（ビルド対象外）
.github/workflows/  # CI（検証のみ。配信は Cloudflare Pages）
```

## 記事が公開されるまで

日常の執筆・査読は、認証付きの運営サイトで行います。`/admin/articles/` で原稿を選び、
`保存する → 査読を依頼する →（全分野管理者が）査読完了 → 公開する` の順に進めます。
公開後の反映は数十秒から数分かかる場合があります。詳しい操作は
[運営サイト管理ガイド](docs/ADMIN_GUIDE.md) を参照してください。

記事本文や翻訳データをGitHubで直接変更する開発作業では、`draft` / `in-review` を公開せず、
CIで検証してからPull Requestをマージします。運営サイトのD1データとGit管理の本文は役割が異なるため、
個人情報や秘密情報をGitへ保存しないでください。

## デプロイ

公開ページはCloudflare側のGit連携でビルドされます。運営機能のWorkerは
`wrangler.jsonc`（学習サイト）と `wrangler.admin.jsonc`（運営サイト）で別々にデプロイします。
GitHub Actions は検証専用で、Secretをリポジトリに置きません。

URL は環境変数 `SITE_URL`（未設定なら Cloudflare の `CF_PAGES_URL`）で決まります。
`main` 以外のブランチのビルドは自動で `noindex` になります。
詳細は [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

ローカル管理WorkerやD1を含む手順は [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md) を参照してください。

## 多言語について

英語版は翻訳が 4 記事しかなく日本語版との差が大きすぎたため、一旦取り下げました。
仕組みは残してあるので、`src/lib/i18n.ts` の `LOCALES` に `"en"` を戻し、
`src/content/articles/eng/` に記事を置けばルーティング・言語切替・hreflang が動きます。

## ライセンス

コード: MIT（[LICENSE](LICENSE)）。記事コンテンツのライセンスは団体で別途決定すること
（教育目的の場合は CC BY-SA 4.0 を推奨候補として CONTRIBUTING.md に記載）。
