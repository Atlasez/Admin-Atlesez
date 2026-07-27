# 情報設計（INFORMATION_ARCHITECTURE）

## 1. 全体構造

二つのサイトを一つのAstroプロジェクトでビルドするが、情報設計・ナビゲーション・デザイントーンは完全に分離する。

- **Atlasez公式サイト**（`/`）: 団体を説明するコーポレートサイト。日本語のみ（当面）
- **学習サイト「アトラス」**（`/atlas/`）: 多言語の学習プラットフォーム

独自ドメイン取得後は `atlasez.org` と `atlas.atlasez.org` に分割可能（`SITE_URL` / `BASE_PATH` 環境変数のみで切替。docs/DEPLOYMENT.md参照）。

## 2. Atlasez公式サイトのサイトマップ

```text
/                       ホーム
/about/                 Atlasezとは
/about/philosophy/      理念・目標
/about/organization/    組織構成
/about/members/         運営メンバー
/about/history/         沿革
/projects/              プロジェクト一覧
/projects/<slug>/       各プロジェクト（learning-atlas, semi-platform, thinking-cafe, …）
/news/                  お知らせ一覧（ページネーション）
/news/<slug>/           お知らせ個別
/join/                  運営メンバー募集
/contact/               お問い合わせ
/privacy-policy/        プライバシーポリシー
/404                    404
```

## 3. 学習サイトのサイトマップ

```text
/atlas/                          → /atlas/ja/ へ案内（言語選択）
/atlas/<locale>/                 総合ホーム（ja, en）
/atlas/<locale>/<subject>/       分野ホーム（mathematics, chemistry, …）
/atlas/<locale>/<subject>/<category>/          カテゴリ（記事一覧）
/atlas/<locale>/<subject>/<category>/<slug>/   個別記事
/atlas/<locale>/map/             学習地図（グラフ＋代替表示＋経路検索）
/atlas/<locale>/search/          検索
/atlas/design-lab/subject-home/  分野ホームUI三案の比較（開発用）
```

## 4. 概念・記事・分類の関係

```text
分野 subject（例: mathematics）
 └─ カテゴリ category（例: set-theory, group-theory）※大分類
     └─ 概念 concept（言語非依存、例: math.set-theory.sets）
         ├─ prerequisites: 他概念への前提関係
         ├─ related: 関連概念
         └─ 記事 article（言語別）: 1記事が1つ以上の概念を説明
             ├─ 演習 exercise（事前/事後、プレースホルダー）
             └─ 学習経路 = 概念グラフ上の prerequisite 閉包から導出
```

- 概念IDは永続（`subject.category.name`）。記事slugはURL用で変更可能
- 翻訳は概念を介して対応づける（記事同士の一対一対応を仮定しない）

## 5. グローバルナビゲーション

**公式サイト**: ロゴ／Atlasezとは／プロジェクト／お知らせ／運営募集／お問い合わせ＋「学習サイト アトラス ↗」ボタン（常設・視覚的に区別）

**学習サイト**: ロゴ（アトラス）／分野（総合ホームへ）／学習地図／検索／運営紹介／言語切替／表示設定＋フッターに「運営: Atlasez」リンク

相互導線: 両ヘッダーに相手サイトへの明示的リンクを常設。学習サイトのフッターとプロジェクトページで団体を紹介。

## 6. パンくずリスト

- 公式: ホーム > セクション > ページ
- 学習: アトラス > 分野 > カテゴリ > 記事（各階層がリンク。`BreadcrumbList` 構造化データ付き）

## 7. 検索と絞り込み

- Pagefindによる全文検索（`/atlas/<locale>/search/`）。タイトル・要約・本文・タグ・別名・概念ID・カテゴリ・執筆者をインデックス
- フィルタ: 分野・カテゴリ・難易度・言語（Pagefindのfilter機能）
- 記事一覧ページ内: クライアントサイドで検索語・カテゴリ・難易度・公開状態の絞り込み

## 8. デバイス別ナビゲーション

| 要素           | PC (≥1024px)                                     | タブレット (768px) | スマホ (<768px)                                  |
| -------------- | ------------------------------------------------ | ------------------ | ------------------------------------------------ |
| グローバルナビ | 水平ナビ常時表示                                 | 水平ナビ（折返し） | ハンバーガー（`<details>`ベース、JS不要で開閉）  |
| 記事内目次     | 左サイドバー固定・スクロール追従・現在見出し強調 | 本文上部の折り畳み | 本文上部の折り畳み＋「目次」戻りボタン           |
| 記事情報・関連 | 右サイドバー                                     | 本文末             | 本文末                                           |
| 学習地図       | 全画面グラフ＋サイドパネル                       | グラフ＋下部パネル | 簡略グラフ（初期は選択分野のみ）＋リスト表示推奨 |

## 9. 団体サイトと学習サイトの行き来

1. 公式ヘッダーの「学習サイト アトラス」ボタン（アクセント色、外部サイト風の扱い）
2. 公式のプロジェクトページ `/projects/learning-atlas/` から総合ホームへ
3. 学習サイトヘッダー右端の「Atlasez」リンクとフッターの運営表記
4. 両サイトの404ページに双方への導線

デザインは共通トークンを基盤にしつつ、公式=紺アクセント・広めの余白、学習=深緑アクセント・読書向け行長で「同一団体だが別サイト」と分かるようにする（docs/DESIGN_DECISIONS.md）。
