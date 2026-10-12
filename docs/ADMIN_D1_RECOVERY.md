# ADMIN D1のバックアップと復元検証

本番はAccount `812021e62fa20465950b61be55dfe064`、D1 `atlasez-reports` / `d5112a62-7ed6-49c8-b6a2-18ee2dbab678`。以下のexportとTime Travel情報取得は読み取り操作で、本番のrestore・migrationは実行しない。

**影響範囲:** 公開Worker `atlasez01` と運営Worker `atlasez-admin` は同じ本番D1を使う。Time Travel restoreは片方のアプリだけを戻す操作ではなく、公開応募・記事報告・ADMINの全データをDB全体で巻き戻す。Cloudflareの[Time Travel仕様](https://developers.cloudflare.com/d1/reference/time-travel/)によればrestoreは全データを上書きし、実行中query/transactionをcancelする。現在の本番DB `version` とTime Travel利用可能期間を、復旧時に読み取り確認する。Time Travelの最大保持はWorkers Paidで30日、Freeで7日だが、対象DBの実際のversion/planを確認するまで本番の保持範囲として決め打ちしない。

## 現行確認（2026-10-12）

- 対象main SHA: `e63ab8b8ecca0dbe042e982fc19e9c3dffc7e370`。
- 固定Accountを明示したremote migration listは `No migrations to apply!`。migration適用はしていない。
- D1 Time Travel metadata取得は成功したが、bookmark値はこの監査記録へ転記していない。Time Travel metadataの存在は、独立した長期バックアップ、暗号化された外部保管、定期取得の成功、復元演習を証明しない。
- 今回、実データexport/download、隔離restore、restore計測、本番restoreは行っていない。
- 2026-09-30/10-02のexport検証は履歴証拠であり、0130適用後を含む最新バックアップの存在や取得時刻を示さない。
- 公開側 `wrangler.jsonc` とADMIN側 `wrangler.admin.jsonc` のD1 bindingが同じdatabase IDを参照することを確認した。D1復元の停止範囲には両Workerと両サイトの利用者を含める。

現行の担当者、代理、暗号化された保管先、保持/削除、失敗通知、RPO/RTO、隔離復元演習は未確認または未決である。下記の数値は運営決定済みのSLOとして扱わない。

ADMINの個人情報期限処理が稼働中D1の列を空化またはNULL化しても、過去のD1 Time Travel snapshotや取得済みexport内の値は自動で書き換わらない。バックアップコピーへのアクセス制限・保持期間・期限切れ削除は、稼働中D1上の保持処理とは別に決定し、公開説明にも区別を記載する。対象アカウントのTime Travel保持状態、過去snapshotの実削除時期、外部backupの有無は別途確認が必要であり、現在の確認結果から推定しない。

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

障害発生時に「復旧直前のexport」を無条件に開始しない。[Export API仕様](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/)では大きなDBのexport中にD1がqueryを処理できない場合があり、完了まで状態pollを続けないとexportがcancelされる。非本番でexport時間、D1 query影響、polling監視、失敗時処理を測り、障害中に開始する条件・中断基準・担当者を事前に定める。

## 障害時の本番復旧

1. 障害時刻、原因、固定Account/DB ID、影響するWorker、最後に成功した業務処理を記録する。PII・認証情報・メール本文をIssue/ログへ残さない。
2. 復旧は両Workerに影響する。別途承認済みの連絡/停止手順で、公開応募と記事報告、ADMINの更新操作、ADMIN 5 Cron、両WorkerのDeployを協調停止する。停止権限・実装済みの停止手段が確認できない場合はrestoreへ進まず、Cloudflare管理者と運営担当の指示を待つ。
3. 復旧前exportは、事前に合意した負荷条件・中断基準を満たす場合だけ取得する。export状態が分からない、query影響が基準を超えた、監視継続できない場合は処理を止め、代替として利用可能なbookmarkと時点を記録する。
4. 復旧候補時点と復旧によって失われる書込・応募・原稿を評価する。復旧時点のmigration/schema状態を確認し、現在稼働Workerが要求するtable/column/checkpointと互換するかADMIN担当・公開サイト担当が検査する。必要と推測したmigrationをその場で適用しない。
5. 固定DB ID、UTCの復旧時刻/bookmark、影響範囲、外部副作用、段階再開条件を二者でレビューし、本番restoreの明示承認を得る。Time Travel restoreは対象DB全体を上書きする破壊的操作として扱う。
6. 承認済みbookmarkを使って固定DBをrestoreする。コマンド/結果の `previous_bookmark` を復旧記録へ保存し、undoに使えることを確認する。Cloudflareはこのbookmarkからrestoreをundoできるとしている。出力を保存できない、固定DB/時刻/SHAが一致しない場合は操作を続けず停止する。
7. 復旧後、公開Worker・ADMIN Worker双方でschema/migration、応募とprofile、membership/permission、task/calendar、原稿/revision/audit、queue/checkpointを照合する。メール送信、Discord role/通知、GitHub PR/公開記事はD1外で起きている可能性があるため、provider/service側の実記録と突き合わせて二重送信・二重公開・欠落を処理する。
8. まず認証・読取画面と専用検証アカウントで受入し、運営代表・DB担当・公開担当が合意した順にCron、公開応募、記事報告、管理画面の書込みを再開する。実メール再送、Discord変更、記事公開・再公開は外部状態を確認した後に別判断する。

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
