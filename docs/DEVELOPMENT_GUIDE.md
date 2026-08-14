# 開発・引き継ぎガイド

日常の運営者向け操作（原稿、査読、ToDo、応募、通知）は [運営サイト管理ガイド](ADMIN_GUIDE.md) を先に参照してください。この文書は、コードを変更する開発者・LLM向けの補足です。

この文書は、Atlasez のサイトを初めて触る人や、別のLLMに改修を依頼する人が、既存の設計を壊さずに変更できるようにするための実装ガイドです。仕様の正本はコードとこのリポジトリのドキュメントです。過去のGoogle Sitesの説明は移行の経緯であり、現在の挙動を決めるものではありません。

## 0. まず確認すること

1. 作業ディレクトリがリポジトリ直下であることを確認する。
2. `git status` で、他の人の未コミット変更を確認する。既存変更をリセット・上書きしない。
3. [CONTENT_MODEL.md](CONTENT_MODEL.md)、[INFORMATION_ARCHITECTURE.md](INFORMATION_ARCHITECTURE.md)、[REPOSITORY_BOUNDARIES.md](REPOSITORY_BOUNDARIES.md)を読む。
4. 変更対象を「公式サイト」「学習サイト」「メンバー用サイト」「学習サイト運営用サイト」「Worker/D1」のどこに属するか決める。
5. 秘密情報（APIキー、OAuth secret、Discord webhook/token、Cloudflare token、個人メールアドレス）をコード・ログ・PRに書かない。

LLMに依頼する場合も、次のように範囲を指定すると安全です。

```text
対象: src/components/LearningMap.astro とそのテスト
目的: 詳細パネルを閉じるUIを追加
触らない: 認証、D1スキーマ、公開記事本文
確認: npm run check、npm test、npm run test:e2e
```

## 1. サイトと実行環境

このリポジトリは、Astroで公式サイトと学習サイトを生成し、Cloudflare Workerで管理画面・APIを提供するモノレポです。

| サイト                 | ローカルURL/入口                                         | 本番の役割                             |
| ---------------------- | -------------------------------------------------------- | -------------------------------------- |
| Atlasez公式サイト      | `http://localhost:4321/`                                 | 団体紹介、プロジェクト、募集、ニュース |
| 学習サイト「アトラス」 | `http://localhost:4321/atlas/ja/`                        | 記事、検索、学習地図、学習記録         |
| メンバー用サイト       | `http://localhost:8787/admin/portal/`                    | 複数プロジェクトの横断HomeとToDo       |
| 学習サイト運営用サイト | `http://localhost:8787/admin/atlas/`                     | 原稿、査読、問題報告、進捗・ToDo・日程 |
| 運営事務局             | `http://localhost:8787/admin/projects/secretariat/`      | 事務局のToDo・日程                     |
| ゼミプラットフォーム   | `http://localhost:8787/admin/projects/seminar-platform/` | プロジェクト固有のToDo・日程           |

本番のWorker URLは、運営環境の設定を確認してから利用する。URLをコードにハードコードしてはいけない。

### Workerの分担

- `src/worker.ts`: 学習サイトの静的アセット配信、問題報告API、匿名記事統計、Discord中継呼び出し。
- `src/admin-worker.ts`: Google OAuth、セッション、D1、原稿編集・査読、通知、ToDo、日程、応募、Discordの権限/チャンネル同期。
- `dist/`: `npm run build` が作る成果物。手編集しない。

## 2. ディレクトリ早見表

```text
src/
  content/                 記事・概念・分野・公式サイト用データ
    articles/<iso639-3>/   言語ごとのMarkdown（例: jpn, eng）
    concepts/              学習地図の概念グラフ
    subjects/              分野・カテゴリ定義
  pages/                   Astroのページルート
    index.astro            公式サイトHome
    atlas/[locale]/        学習サイトの各ページ
    admin/                 運営サイトの画面
    apply/                 ログイン不要の運営参加応募
  components/              再利用UI
  layouts/                 公式/学習/運営のページ枠
  lib/                     URL、i18n、グラフ、公開判定などの共通ロジック
  styles/                  デザイントークンとサイト共通CSS
  worker.ts                学習サイトWorker
  admin-worker.ts          運営サイトWorker
migrations/                D1の前進のみのマイグレーション
scripts/                   記事生成・検証・一括修正
tests/                     Vitest/Playwright/axe
public/                    静的画像、headers、favicon
docs/                      仕様・運用・引き継ぎ文書
```

## 3. どこを変更するか

| 変更したいもの                | 主なファイル                                                                                              | 注意                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 公式サイトの見た目/ページ     | `src/pages/`, `src/layouts/OrgLayout.astro`, `src/styles/`                                                | 学習サイトのCSSを直接流用しない                                    |
| 学習サイトのヘッダー/表示設定 | `src/layouts/AtlasLayout.astro`, `src/components/`                                                        | ロゴはHome。上部の「分野」は置かない                               |
| 学習記事の本文                | `src/content/articles/jpn/.../*.md`                                                                       | frontmatter、概念ID、状態を守る                                    |
| 分野/カテゴリ                 | `src/content/subjects/subjects.yaml`                                                                      | slug変更は既存URL・概念参照への影響を確認                          |
| 学習地図                      | `src/content/concepts/concepts.yaml`, `src/components/LearningMap.astro`, `src/pages/atlas/graph.json.ts` | ノード状態、経路検索、詳細パネルを一緒に確認                       |
| 学習記事の数式/定義枠         | Markdown処理設定、数学記事CSS、`src/styles/`                                                              | KaTeX/MathJax、スマホの横はみ出しをE2Eで確認                       |
| 原稿一覧/編集/査読            | `src/pages/admin/articles.astro`, `editor.astro`, `src/admin-worker.ts`                                   | 認証・担当分野権限をUIだけでなくWorker側でも検証                   |
| コメント/返信/通知            | `src/pages/admin/editor.astro`, `src/admin-worker.ts`, D1 migrations                                      | 投稿者・記事担当者以外の閲覧範囲を広げない                         |
| ToDo/日程/横断Home            | `src/pages/admin/operations.astro`, `portal.astro`, `src/admin-worker.ts`                                 | `editorial_tasks.project_id`を必須として扱う                       |
| 応募フォーム                  | `src/pages/apply/index.astro`, `src/admin-worker.ts`                                                      | ログイン不要だが、個人情報はD1と通知先だけに保存                   |
| Discord連携                   | `src/admin-worker.ts`, `wrangler.admin.jsonc`                                                             | Bot secretはCloudflare Secretのみ。学習WorkerにBot tokenを置かない |

## 4. コンテンツのルール

### 言語コード

リポジトリの保存単位はISO 639-3の3文字コードです。日本語は `jpn`、英語は `eng` とします。利用者向けURLの `ja` / `en` は互換エイリアスであり、保存パスやデータの主キーには使いません。新しい言語を追加するときは `src/lib/i18n.ts`、翻訳辞書、記事ディレクトリ、E2E/翻訳チェックを同時に更新します。

### 記事

記事の追加は原則として次のコマンドから始めます。

```bash
npm run new:article -- --subject mathematics --category group-theory --slug example --title "記事タイトル"
```

公開状態は frontmatter の `status` で管理します。`draft` / `in-review` は公開対象外、`published` のみが公開ビルドに入ります。記事slug、概念ID、カテゴリslugを変更するとリンクや学習地図が壊れる可能性があるため、変更時はリダイレクトまたは移行メモを追加します。

### 概念グラフ

`concepts.yaml` は言語非依存の概念データです。`prerequisites` は前提、`related` は関連、概念から記事への対応は記事frontmatterで指定します。学習地図のレイアウトは長距離の引力と近距離の斥力を持つforce simulationで決まり、表示上の学習状態はブラウザ内の学習記録から反映されます。データを変更したら、地図・リスト・記事リンクの3画面を確認します。

## 5. 運営サイトのデータと権限

運用データはD1（`atlasez-reports`）に保存され、記事リポジトリには保存しません。主なテーブルはマイグレーションを検索してください。

```bash
rg -n "CREATE TABLE|ALTER TABLE" migrations
```

重要な領域:

- 原稿、版履歴、公開状態、査読コメント、返信、コメントタグ
- 通知と既読状態
- `editorial_tasks`（`project_id`, 担当、期限、状態、リマインダー）
- プロジェクト参加者、プロフィール、担当分野
- 応募、応募承認、Discord同期状態
- 問題報告、匿名記事統計、Discordチャンネル対応表

D1変更は必ず新しい連番migrationを追加し、既存migrationを書き換えません。ローカルで適用してから、承認済みの本番手順でremoteへ適用します。

権限は画面の表示/非表示だけに頼らず、`src/admin-worker.ts`のAPIでも判定します。全分野管理者専用の担当者管理、応募管理、Discordロール同期などを一般運営者に公開しないでください。メールアドレス、Google subject、Discord IDなどは必要な管理者以外に返さない設計を維持します。

## 6. ローカル開発

```bash
npm ci
npm run dev                         # Astro: http://localhost:4321
npm run build && npm run preview    # 公開ビルドの確認
npm run db:reports:local            # D1 local migration
npm run dev:admin                   # 管理Worker: http://localhost:8787
```

管理画面のローカル認証は `wrangler.admin.local.jsonc` の `ADMIN_AUTH_MODE=local` とテスト用メールを使います。本番Google OAuthをローカルにコピーしたり、実際の個人情報をD1へ投入したりしません。

### テスト

変更規模に応じて次を実行します。

```bash
npm run check
npm run lint
npm run format:check
npm test -- --run
npm run build
npm run test:e2e
node scripts/validate-content.mjs
node scripts/check-links.mjs dist /
```

UI変更は最低でも `npm run check`、単体テスト、`npm run build`を実行し、スマホ幅390pxとPC幅1280pxで目視します。学習地図、認証、D1、公開フローを変えた場合はE2Eと該当するWorker APIテストも実行します。

## 7. デプロイとリリース

静的サイトとWorkerの設定は別物です。

```bash
npm run build
npx wrangler deploy --config wrangler.jsonc          # 学習サイトWorker
npx wrangler deploy --config wrangler.admin.jsonc   # 運営サイトWorker
```

通常の公開記事はGitHubのPRをCIで検証し、`main`へのマージ後にCloudflare側の接続設定で公開します。Worker/D1を変更する場合は、デプロイ前にmigration、Secret、環境変数、ロールバック方法を確認します。詳細は [DEPLOYMENT.md](DEPLOYMENT.md) と [PUBLISH.md](PUBLISH.md) を参照してください。

### Secretの扱い

次のような値は絶対にGitへコミットしません。

- Google OAuth client secret / session secret
- Cloudflare API token / D1 credential
- Discord Bot token / webhook URL
- Resend API key
- 個人のメールアドレスや本番D1のダンプ

SecretはCloudflareのSecretとして登録し、設定名だけをwrangler設定・文書に記載します。誤って公開した場合は、値を削除するだけでなく直ちに失効・再発行します。

## 8. PRの作り方

1. `main`の最新を取得し、目的が分かるブランチを作る。
2. 変更理由・対象範囲・非対象範囲をPR本文に書く。
3. UI変更はPC/スマホのスクリーンショットまたは確認手順を書く。
4. D1変更はmigration番号、互換性、ロールバック方針を書く。
5. `git diff --check` と必要なテストを通す。
6. 個人情報・Secret・`dist/`の手編集が差分にないことを確認する。

LLMが作った変更は、必ず人間が差分・権限・データ移行・公開範囲を確認してからマージします。

## 9. 既知の制約と今後の候補

- `LearningMap.astro`は大きな単一コンポーネントで、データ取得・レイアウト・経路検索・詳細UIの分割余地があります。
- 学習記録は現在ブラウザ内保存で、端末間同期はありません。読者ログインを追加する場合は同意、削除、エクスポート、匿名化を先に設計します。
- 画像・動画が増えたらGitではなくR2などへ移し、記事からは安定したasset IDを参照します。
- 教育機関の候補データは候補リスト＋自由入力を基本とし、公式学校コードの定期取り込みは出典・更新・国外機関の扱いを決めてから行います。
- Pagefindのリダイレクト用ページに「外側のhtml要素がない」警告が出ることがありますが、検索対象外の転送ページであれば実害はありません。
- `src/pages/admin/workspace.astro`には旧API取得処理の整理余地があります。変更時はプロフィールAPIとプロジェクトAPIの両方を壊さないようにします。

## 10. 参照先

- [ドキュメント索引](README.md)
- [記事の書き方](ADDING_ARTICLES.md)
- [コンテンツモデル](CONTENT_MODEL.md)
- [編集・査読フロー](EDITORIAL_WORKFLOW.md)
- [編集ワークスペース](EDITORIAL_WORKSPACE.md)
- [学習地図](CONCEPT_GRAPH.md)
- [情報設計](INFORMATION_ARCHITECTURE.md)
- [リポジトリ境界](REPOSITORY_BOUNDARIES.md)
- [アクセシビリティ](ACCESSIBILITY.md)
- [デプロイ](DEPLOYMENT.md)
