# ADMINバックアップ運用案 — 2026-10-02

Issue [#407](https://github.com/Atlasez/Admin-Atlesez/issues/407)と[`ADMIN_D1_RECOVERY.md`](ADMIN_D1_RECOVERY.md)の既存記録を読み直し、P0-8の証拠と未整備項目を分けた提案資料。Cloudflare設定、D1、R2、Workflowは変更していない。

## 現在確認できる証拠

- 2026-10-02に確保したexport: 10,872,416 bytes、SHA256 `71d00dd248479d2088d253486e704e536b9b48d755fbca1d44cd400b797f1ed8`。
- 隔離SQLiteへ展開: 75 tables、`integrity_check=ok`、foreign-key違反0件。
- exportはmigration 0120〜0123の適用前。現行本番D1の最新export、Cloudflare上でのrestore、アプリの起動確認、所要時間測定を示す証拠ではない。
- RepositoryにはD1 bindingがあるが、R2 bucket、scheduled Workflow、定期export、backup成功manifest、監視/通知設定は見当たらない。

## 復旧レイヤー

Cloudflare D1 Time Travelは短時間の誤操作復旧に使う。利用可能期間は契約プランで確認し、公式資料上Freeは7日、Paidは30日。bookmark時点へDB全体を復元する破壊的操作であるため、復元前に現状を別exportし、対象DBと復元時刻を二者確認する。production restoreは専用の変更レビューと明示的な実施承認なしに行わない。

長期保存用の提案はCloudflare D1 Export APIからR2へ定期保存する構成。Cloudflare公式の[Workflow例](https://developers.cloudflare.com/workflows/examples/backup-d1/)はexport開始、bookmark取得、完了までのpoll、signed URLからSQL取得、R2保存を示す。[schedule trigger](https://developers.cloudflare.com/workflows/build/trigger-workflows/)を利用できる。

ただし[D1 Export API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/)は、大きなDBのexport中にD1がqueryを処理できなくなる場合がある。export状態のpollを継続しない場合は処理が自動cancelされる。現状の約10.9 MBでの停止有無と継続時間は未測定であり、本番日次化の前に非本番環境で確認する。必要な場合だけ低トラフィック帯に本番で限定検証し、query影響の停止基準を事前に決める。

## 運用のたたき台

| 項目      | 提案値                                                                                                      | 現状           |
| --------- | ----------------------------------------------------------------------------------------------------------- | -------------- |
| 実行      | UTCで1日1回。非本番でexport時間とquery影響を測定してから決定                                                | 未設定         |
| 保存先    | Cloudflare R2専用bucket/prefix。別Accountまたは独立した保管先も災害モデルと個人情報条件で比較               | 未決定         |
| 検証      | export状態/error、signed URL取得、R2 object size、SHA-256、bookmark、対象D1 ID、UTC時刻を成功manifestへ記録 | 未設定         |
| 通知      | job失敗または最終成功から26時間超で運営ownerと代理へ通知                                                    | 未設定         |
| retention | 35日保持を初期案とする。Lockを使う場合も35日にそろえ、削除境界を個人情報方針と合わせる                      | 未決定         |
| owner     | 運営代表とDB/Cloudflare担当を実名で指定                                                                     | 未指定         |
| 復元演習  | 月1回、isolated non-production D1へrestoreし、integrity/FK/API smokeを確認                                  | 未設定         |
| RPO / RTO | RPO 24h、RTO 4hを検討目標とする                                                                             | 合意・実績なし |

Cloudflare公式[R2 lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)と[Bucket Locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)は保存期限・最低保持の実装候補。LockはLifecycleより優先されるため、35日Lockと90日Lifecycleを同時に設定すると実際には90日まで削除されない。35日保持を候補とする場合は両方の期間を35日にそろえる。90日を選ぶ場合は、個人情報保持方針・費用・削除境界の合意後に別案として記録する。同一Cloudflare Account上のR2をAccount喪失・侵害から独立したbackupとみなせるかはこの資料から確認できないため、災害対策の要件を決めて保存先を選ぶ。

## 実装前に決める事項

1. R2保存先のowner、Account、リージョン/障害分離要件、アクセス主体、秘密情報管理。
2. 個人情報保持方針に合う保存期限、暗号化、削除手順、誤削除対策。
3. 担当者と代理、通知先、連絡不能時の手順。
4. 非本番Export APIの所要時間・クエリ影響、再試行と異常停止の基準。
5. RPO/RTOの合意と、restore後のアプリ受入範囲。
6. Cloudflare権限とWorkflow/R2 bindingを含めた設定PR、レビュー、main経由の適用。

## 検証の完了条件

- scheduleが予定時刻に起動し、export errorを成功扱いしない。
- R2 objectのサイズとSHA-256がmanifestと一致し、bookmark・D1 ID・export時刻が追跡できる。
- export失敗と「最終成功から26時間超」の両方でowner/代理への通知を確認する。
- 期限経過後にretention削除が意図したobjectだけへ適用されることを非本番bucketで確認する。
- isolated non-production D1へ定期restoreし、SQLite/D1 integrity、foreign key、主要API smoke testが合格する。production D1を試験目的で上書きしない。
- restore所要時間を記録し、合意したRTO内で復旧できる証拠を残す。
