# ADMIN優先改善の再開記録（2026-10-01）

## 状態

本番へのマージ・デプロイ・migrationは未実行。mainは `b4767cbb23f45b4783a74b837b5e31b70b5d9e84`。本番build-infoとのSHA不一致とWorkers Builds未接続を解消するまで本番反映を停止する。

| 優先項目                                            | 状態・成果物                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1: 本番Builds復旧                                   | PR #479。設定案と停止理由を記録。新規APIトークン作成・接続操作の承認と設定レビュー待ち                  |
| 2–5: 保存中の追加編集、タスク操作・検索・件数・期限 | PR #480。実装・ローカル検証・CI成功。レビュー待ち                                                       |
| 6: 実認証の統合確認                                 | ライブ確認13件成功。main SHA一致の確認は失敗し停止。別の実利用者アカウントを使う役割別確認は残る        |
| 7: 必須レビュー                                     | canonical mainの必須承認1名と古い承認の無効化を設定済み                                                 |
| 8: D1復旧                                           | PR #480に手順と検証スクリプト。読み取り専用exportをローカル復元し75テーブル・整合性・外部キーを確認済み |
| 9: 運営統計                                         | PR #481。期限超過・担当負荷・承認待ち期間、migration 0120。CI成功、レビュー待ち                         |
| 10: タスクテンプレート・定期作成                    | このbranch。migration 0121、本人所有・所属確認・重複防止・月末／夏時間対応                              |
| 11: 通知改善                                        | このbranch。migration 0122、表示中の要約・重要度・種類別設定・再表示予約                                |
| 12: 大きいファイルの分割・APIエラー共通化           | 保存・タスク・統計・通知と新機能で段階的に分割済み。Worker・エディタ全体の分割は残る                    |

## 再開先

- 正本remote: `admin` / GitHub `Atlasez/Admin-Atlesez`。
- PR #479: https://github.com/Atlasez/Admin-Atlesez/pull/479
- PR #480: https://github.com/Atlasez/Admin-Atlesez/pull/480
- PR #481: https://github.com/Atlasez/Admin-Atlesez/pull/481
- 本branch: `codex/admin-task-notification-tools-20261001`。
- worktree: `/Users/user/.codex/worktrees/admin-task-notification-tools/Atlasez01-pr`。
- 本branchのPRは同じbranch名からGitHubで確認できる。本文と `ADMIN_TASK_NOTIFICATION_TOOLS.md` にデータ影響・復旧方法・検証を記載する。
- 初回停止時の記録はPR #480の `ADMIN_PRIORITY_WORK_RESUME.md`。この文書が再開後の更新記録。

## 次の順序

1. 全PRのCI・レビュー・競合を確認する。#481と本branchで抽出した `admin-database.ts` は同一内容のため、Workerのimport競合があれば双方のimportを保持して解消する。
2. #479のレビューと、新規Workers Builds APIトークン・接続操作に対する承認を得て、固定Worker・Account・main接続を確認する。
3. レビュー完了後に不具合修正、統計、新機能の順でmainへ進める。migration 0120→0121→0122の順序と必要なバックアップをレビューする。
4. Workers Buildsでmainから反映し、build-info SHA・正しいVersion・100%配信と認証済みChrome画面を確認する。異常時に別デプロイ経路・推測rollbackを使わない。
5. 実利用者の役割別確認と、Worker・エディタ全体の分割を追加PRで進める。
