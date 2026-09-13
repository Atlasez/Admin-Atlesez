# 管理サイト全面監査 引き継ぎスナップショット

更新日：2026-09-14（Asia/Tokyo）

この文書は、管理サイトの全面監査・UI改善作業を別の担当者へ引き継ぐための保存記録です。現在のブランチはレビュー前のWIPスナップショットであり、本番へマージ・デプロイしてはいけません。

## 保存場所

- リポジトリ：`https://github.com/Atlasez/Admin-Atlesez`
- ブランチ：`codex/goal-audit-handoff-20260914`
- 基準となる本番 `main`：`735a885`（2026-09-14時点）
- このスナップショット作成前の状態：変更済み58ファイル、未追跡10ファイル
- 保存コミット：この文書と実装差分を同じコミットにまとめる

## 含まれる作業範囲

- 管理画面の認証境界、共通API応答、権限・分野スコープ
- アクションセンター、通知、タスク、編集・フィードバック、記事編集、目次の導線整理
- 分野／カテゴリ／ジャンル／役割／運営メンバー管理のUIとライフサイクル
- D1マイグレーション `0111`〜`0113` と、それに対応するAPI・単体テスト・E2Eテスト
- 管理画面18ルートのレスポンシブ／テーマ別スクリーンショット行列
- デプロイ設定、build-info検証、運営・開発ドキュメント

## すでに本番へ反映済みの関連変更

- [PR #391](https://github.com/Atlasez/Admin-Atlesez/pull/391)：編集フィードバックと学習サイト目次の統合
- [PR #392](https://github.com/Atlasez/Admin-Atlesez/pull/392)：編集フィードバックカードの説明文削除
- [PR #393](https://github.com/Atlasez/Admin-Atlesez/pull/393)：学習サイトの分野／カテゴリ画面のレイアウト修正

上記の本番状態はこのWIPブランチではなく、`main`と本番デプロイ記録を正とします。

## 重要な未完了条件

- このブランチの差分は複数の目的が混在しており、まだレビュー可能な単位へ分割していません。
- `0111`〜`0113`は適用順、既存本番スキーマとの差分、ロールバック方針を確認してから扱います。
- Previewの認証付き実環境、外部Discord／Googleの実アカウント操作、再デプロイ後の本番回帰確認は別途必要です。
- セッション失効機能の対象メールは、公開リポジトリへ実アドレスを残さないため匿名プレースホルダーに置換しています。本番で使用する前に、運営者が承認した非公開の設定経路へ正しい対象を登録し、コードレビューとテストを行ってください。
- この保存作業自体では本番D1、プロフィール、記事、応募、権限、監査履歴を変更していません。

## 引き継ぎ手順

```sh
git clone https://github.com/Atlasez/Admin-Atlesez.git
cd Admin-Atlesez
git fetch --all --prune
git switch --track admin/codex/goal-audit-handoff-20260914
npm ci
npm run check
npm run lint
npm run format:check
npm test -- --run
npx playwright test
npm run verify:deploy-config
npm run verify:build-info
git diff --check
```

その後、次の順で進めます。

1. 変更を認証、API共通化、画面UI、D1、テスト、文書の単位へ分割する。
2. 各マイグレーションを本番バックアップとスキーマ比較後に検証する。
3. 実メール・OAuth秘密情報・CloudflareトークンをGitへ追加せず、非公開の設定・Secretへ登録する。
4. Draft PRを通常PRへ切り替え、CIとレビューを通してから `main` へマージする。
5. `main`からのみ本番へデプロイし、build-info、認証境界、D1の読み取り専用確認、主要画面のスクリーンショットを再確認する。

## GitHub外で別途引き継ぐもの

GitHubのコードだけでは運用を完全には再現できません。次のアクセス権と保管場所を、別の安全な経路で引き継ぎます。

- GitHub Organization、リポジトリのActions／Environment／Branch protection
- Cloudflare Worker、D1、Workers Builds、Custom Domain、DNS／Access
- Google OAuthのClient ID／Secretと認証設定
- Discord Bot／Webhookと対象サーバー権限
- Cloudflare・GitHub・Google・DiscordのSecret、バックアップ、復旧手順
- 運営用Google Drive、Discord、ドメイン管理、請求・所有者情報

秘密情報や実ユーザーの個人情報はこのリポジトリへ保存しません。アクセス権の引き継ぎ完了を、コードの引き継ぎ完了とは別に確認してください。
