# 運営サイト改善の再開メモ（2026-10-01）

ユーザーの「一旦途中でやめて再開できるように整理してね」により、新しい実装は中断した。次回はこの文書とAGENTS.mdの指定文書を読み、git statusから再開する。

## 作業場所

- 正本: GitHub `Atlasez/Admin-Atlesez`、remote `admin`。
- 作業worktree: `/Users/user/.codex/worktrees/admin-priority-improvements/Atlasez01-pr`。
- 修正branch: `codex/admin-save-task-safety-20260930`。
- 開始時のmain: `b4767cbb23f45b4783a74b837b5e31b70b5d9e84`。
- 元の `/Users/user/Downloads/Atlasez01-pr` と他の既存worktreeには変更していない。

## 優先順の進捗

| 順位    | 内容                                                   | 状態                                                                                                                                           |
| ------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 / P0  | 本番のWorkers Builds接続復旧                           | 設定レビューPR [#479](https://github.com/Atlasez/Admin-Atlesez/pull/479) 作成済み、verify成功。接続・新規API token作成の承認待ち。未接続のまま |
| 2 / P1  | 自動保存中の追加入力を未保存として保持して次回保存する | 実装済み、遅いPATCHを再現したE2E成功                                                                                                           |
| 3 / P1  | タスク保存失敗後のボタン復帰、作成連打の防止           | 実装済み、通信切断・HTML 502・連打E2E成功                                                                                                      |
| 4 / P1  | 先頭50件に限らないタスク検索と全件数                   | 検索・状態・プロジェクト・担当・期限のSQL条件をLIMIT前に適用。集計と表示件数を分離。実装・テスト済み                                           |
| 5 / P1  | タスク期限の形式とタイムゾーン                         | 宣言したタイムゾーンで表示。閲覧者の日付境界を各保存timezoneへ変換して検索。SQLiteで境界・不正値を検証                                         |
| 6 / P1  | 本番相当の認証テスト                                   | ライブスモークを実API/読込完了/未認証拒否/SHA比較へ強化。認証済み本番13項目成功、SHA不一致1項目失敗。別権限の実アカウント検証は未実施          |
| 7 / P1  | GitHub mainでPRレビュー必須化                          | 適用済み。1名承認＋追加commit時の承認失効。verify必須/strict/admin適用/force-push禁止/delete禁止を保持して再取得確認                           |
| 8 / P1  | D1復元手順と復元確認                                   | 本番からread-only exportしてローカル復元、75テーブル、integrity ok、FK不整合0。手順と再検証スクリプト追加。本番restore未実施                   |
| 9 / P2  | 統計: 承認待ち期間、期限超過、担当負荷                 | 調査開始のみ。実装なし。次の着手候補                                                                                                           |
| 10 / P2 | タスクテンプレート・定期作成                           | 未着手                                                                                                                                         |
| 11 / P2 | 通知要約・重要度・設定・スヌーズ                       | 未着手                                                                                                                                         |
| 12 / P3 | Worker/編集画面の分割とAPI処理共通化                   | 横断タスクのscriptと保存比較/期限/filter処理は分離済み。Worker全体・編集画面全体の分割は未着手                                                 |

## 変更の内容

- 編集画面で、PATCHへ送信したpayloadと現在のpayloadを比較する。concurrency tokenのbaseUpdatedAtだけを比較対象から除き、保存中の追加入力を保存済み扱いしない。
- 保存後のcatalog再取得で分類が先頭項目へ変わる既存不具合も修正。現在の分類を保持する。
- 離脱確認は表示メッセージだけでなく明示的な未保存状態を使う。
- 横断タスクの権限制約を保持し、追加の検索条件もSQLへ移す。GETは世代番号・AbortControllerで古い応答を無視し、POST/PATCHはボタンロックとfinallyで復帰する。
- D1 schema/migration、Durable Object、公開サイト、Cloudflare設定は変更していない。

## 検証と注意点

中断前に `verify:deploy-config`、`check`（errors 0/warnings 0/既存hints 9）、`lint`、単体テスト338件、`format:check`、ADMIN build、`verify:build-info`が成功。編集・横断タスクのE2Eは104件成功。その後に追加した期限一致境界テストも成功（合計339件）。最新の検証は修正PR本文を正本とする。

本番ライブ検証はモックなし。主要6画面、実API6項目、未認証拒否の合計13項目が成功。`E2E_EXPECTED_MAIN_SHA`を指定したSHA比較は以下の差で失敗しており、本番反映は成功扱いにしない。

- 期待main: `b4767cbb23f45b4783a74b837b5e31b70b5d9e84`
- 本番build-info: `74084dc6147490fef228b6a1f68ae3fedae79ba7`
- Cloudflare Version: `2f9440ea-e4e3-4689-89d0-c8d27ac7d95f`、配信100%、作成 `2026-09-29T10:57:58.588Z`。
- Source: Unknown / version_upload。
- 既存インシデント: [#407](https://github.com/Atlasez/Admin-Atlesez/issues/407)。

本番Cookieを含むライブテスト用ファイル、SQL export、一時復元DBは削除した。再開時にライブテストを行う場合は、認証済みChromeから必要なCookieだけを取得してchmod600の一時Storage Stateを作り、検証後に削除する。ログやPRに秘密データを出さない。

## 承認待ちと再開手順

1. git statusと最新main/修正PRのCI・review状態を確認する。中断は再開の指示があるまで維持する。
2. P0のPR #479をレビューしてもらう。Workers Builds新規token作成を含む接続の確認は未回答のため実行しない。Chromeの正しいWorker設定画面には接続フォームが入力済みだが、最終「接続」は押していない。再開時には画面を再取得し、staleな要素番号を使わない。
3. 接続設定はPR #479の値だけを使う。Account/Worker/branchが一致し、承認済みの場合だけ接続し、最初のbuildを監視する。失敗・SHA不一致・想定外Versionなら停止してIssue #407へ記録する。手動deployやrollbackへ切り替えない。
4. 修正PRはCIと1名のレビュー承認後にのみmainへマージする。本番接続が復旧するまでデプロイしない。mainのSHA/Version/100%配信を確認し、Chromeで主要画面を確認する。
5. その後に優先9から再開する。統計は現状operations/progressの取得上限があるため、権限を確認した全件SQL集計APIが必要。担当負荷はCSV担当者を正しく分割し、未担当・全員担当を区別する。期限判定は今回のhelperを再利用する。
6. 優先10/11は保存・時刻・重複防止・権限とデータ復旧への影響を設計し、必要なmigrationをPRでレビューする。承認前に本番DBへ適用しない。
