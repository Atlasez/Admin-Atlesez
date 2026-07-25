# デプロイ（DEPLOYMENT）

## 1. 構成の切り替えは環境変数のみ

| 変数        | GitHub Pages (project site) | 独自ドメイン          |
| ----------- | --------------------------- | --------------------- |
| `SITE_URL`  | `https://<user>.github.io`  | `https://atlasez.org` |
| `BASE_PATH` | `/Atlasez01`              | `/`                   |

CI（`.github/workflows/ci.yml`）ではリポジトリ名から自動設定される。

## 2. ホスティング比較

| 項目                                  | GitHub Pages           | Cloudflare Pages       | Vercel                 |
| ------------------------------------- | ---------------------- | ---------------------- | ---------------------- |
| 費用                                  | 無料                   | 無料枠が広い           | 無料枠あり（商用制限） |
| 独自ドメイン + HTTPS                  | ○                      | ◎                      | ◎                      |
| PRプレビュー環境                      | ×（別途工夫が必要）    | ◎ 自動                 | ◎ 自動                 |
| サブドメイン分離（atlas.atlasez.org） | △ リポジトリ分割が必要 | ◎ 複数プロジェクト容易 | ◎                      |
| ビルド                                | GitHub Actions         | 内蔵 or Actions        | 内蔵                   |
| 帯域・制限                            | ソフト制限 100GB/月    | 実質無制限             | 100GB/月（無料）       |
| 将来のSSR/Functions                   | ×                      | ◎ Pages Functions      | ◎                      |

**推奨**:

1. **現段階（要件どおり）**: GitHub Pages。`main`マージで `actions/deploy-pages` により自動公開
2. **独自ドメイン取得後の推奨移行先**: Cloudflare Pages。PRプレビュー・サブドメイン分離（`atlasez.org` と `atlas.atlasez.org` を2プロジェクトまたは1プロジェクト+リダイレクトで実現）・将来の動的機能に最も適する。移行はビルドコマンドと環境変数の設定のみ

## 3. GitHub Pagesの初期設定手順

1. GitHubにリポジトリ `Atlasez01` を作成しpush
2. Settings → Pages → Source を「GitHub Actions」に設定
3. mainへpush → CI成功後、`https://<user>.github.io/Atlasez01/` で公開
4. ブランチ保護: Settings → Branches → mainに「PR必須・CI必須・レビュー1名」を設定

## 4. 独自ドメイン（GitHub Pagesの場合）

1. DNSで `atlasez.org` の `A/AAAA` または `CNAME` をGitHub Pagesに向ける
2. Settings → Pages → Custom domain に `atlasez.org` を設定（`public/CNAME` が生成される）
3. リポジトリのActions variablesで `SITE_URL=https://atlasez.org`, `BASE_PATH=/` を設定（ci.ymlのenvを差し替え）
4. 学習サイトを `atlas.atlasez.org` に分離する場合は、`src/pages/atlas` を第二リポジトリ/第二Pagesプロジェクトとして切り出すか、Cloudflare Pagesへ移行する（推奨）

## 5. PRプレビュー

- GitHub Pagesのみの場合: CIの `upload-pages-artifact` をダウンロードしローカルで確認、
  または `actions/deploy-pages` のpreview環境（環境保護ルールで制御）
- Cloudflare Pages移行後: PRごとに `*.pages.dev` プレビューURLが自動発行される

## 6. ロールバック

GitHub Pages: 直前の成功コミットへ `git revert` してpush（再デプロイ）。
デプロイはビルド成果物の置き換えのみで、データベース等の状態を持たないため安全に巻き戻せる。
