# ADMIN D1のバックアップと復元検証

本番はAccount `812021e62fa20465950b61be55dfe064`、D1 `atlasez-reports` / `d5112a62-7ed6-49c8-b6a2-18ee2dbab678`。以下のexportとTime Travel情報取得は読み取り操作で、本番のrestore・migrationは実行しない。

## 保存とローカル復元の検証

バックアップには会員・原稿等の非公開データが含まれる。リポジトリ・PRへ添付せず、所有者だけが読めるディレクトリへ保存する。Node.js 22.13以上を使う。

```bash
umask 077
mkdir -p /absolute/private/backup-directory
npx wrangler d1 time-travel info atlasez-reports --config wrangler.admin.jsonc --json > /absolute/private/backup-directory/bookmark.json
npx wrangler d1 export atlasez-reports --remote --config wrangler.admin.jsonc --output /absolute/private/backup-directory/reports.sql --skip-confirmation
node scripts/verify-d1-export.mjs /absolute/private/backup-directory/reports.sql
```

検証スクリプトはメモリ内SQLiteへSQL全体を復元し、`PRAGMA integrity_check`と`PRAGMA foreign_key_check`を実行する。内容・メールアドレス・行データは出力せず、ファイルサイズ、ハッシュ、テーブル数のみ報告する。これはSQL exportから復元できることの確認であり、CloudflareへのTime Travel復旧の実行試験ではない。

バックアップ時刻と検証結果を記録し、承認済みの暗号化ストレージへ保存する。保存先・閲覧者・保持期間が未決の場合、外部サービスへ自動アップロードしない。Time Travelの保持期間と現在利用可能なbookmarkは[公式仕様](https://developers.cloudflare.com/d1/reference/time-travel/)および対象DBの情報で確認する。

## 障害時の本番復旧

1. 通常の書き込みとデプロイを停止し、障害発生時刻、原因、対象DBをIssueへ記録する。
2. 復旧直前のexportとbookmarkも確保する。復旧対象時刻と復旧によって失われる書き込みを評価する。
3. 候補SQLをローカルへ復元して整合性と必要なテーブルを確認する。SQL exportはD1の完全な機能・本番動作を再現するものではない。
4. 固定DBの復旧時刻・bookmark、影響範囲、復旧後の確認手順をレビューし、本番復旧について明示承認を得る。
5. 承認されたbookmarkを使って固定DBのみ復旧する。推測した時刻、別DB、UIの無確認restoreは使わない。
6. 原稿・版履歴、タスク、プロフィール、申請、権限の関連を確認する。認証済みChromeでポータル、カレンダー、タスク、マイページ、管理画面を確認し、必要な書き込みを再開する。

## 2026-09-30の検証結果

- 固定本番DBのSQL export: 10,870,981 bytes。
- SHA256: `4d6da9b1c7037c7f22abc350a9df9ec9cf39fbcc47286aacc114ea72273e5371`。
- 復元したテーブル数: 75。
- 整合性: `ok`、外部キー不整合: 0件。
- 本番D1の書き込み・restore・migration: 実施なし。
- 秘密データを含むexportと一時復元DBは検証後に削除。検証結果のみ記録。

## 2026-10-02の独立再検証

- 所有者のみ読み取り可能な既存exportを隔離SQLiteへ復元した。
- 10,872,416 bytes、SHA256 `71d00dd248479d2088d253486e704e536b9b48d755fbca1d44cd400b797f1ed8`。
- 75テーブル、integrity `ok`、外部キー不整合0件。
- データ行の出力、外部送信、本番restoreは実施なし。これは0120〜0123の適用前バックアップであり、最新状態のバックアップではない。

## 運用開始前に確定する運用案

| 項目     | 運用案                                                                                    | 現状                                           |
| -------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 一次担当 | 運営代表が固定DB、バックアップ日時、ハッシュ、復元結果を確認                              | 担当役割の案。代理担当者の指名が未完了         |
| 保存     | 所有者専用ディレクトリ（directory 700 / file 600）にSQLとbookmarkを保管。Gitに置かない    | 既存exportは専用保管。外部暗号化保管先は未確定 |
| 頻度     | 通常1日1回、migration/大規模変更の直前にも取得                                            | 定期実行は未設定。手動手順のみ                 |
| 保持     | 日次30世代、変更前exportは変更後の受入完了まで保持                                        | 案。自動削除は未設定                           |
| 目標RPO  | 24時間以内。Time Travelの使用可否と保持期間を個別に確認                                   | 定期取得未設定のため未達成                     |
| 目標RTO  | 4時間以内。候補復元・関連確認・承認・再開を含む                                           | メモリ内復元成功。実復旧所要時間は未実証       |
| 復元演習 | 月1回、隔離環境へ復元して整合性・権限・原稿版履歴・タスク・応募・プロフィールの関連を確認 | 今回はSQL整合性まで確認                        |

日次exportの成功だけで受入完了にしない。保存先の暗号化、運営代表と代理担当のアクセス、障害時の連絡先、失敗通知、保持・削除、復旧承認経路を記録してから運用する。承認されていない外部保存先へ会員データをアップロードしない。復旧の本番書き込みは上記の明示承認手順を守る。
