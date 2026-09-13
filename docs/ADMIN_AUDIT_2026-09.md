# 運営サイト全体監査記録（2026-09）

## 対象

`admin.atlasez.org` の管理ページ、`/api/admin/*`、共通ナビゲーション、記事編集・公開、タスク、承認、権限、一覧ページを対象に、main 反映済みの状態を監査した。学習サイトの表示・APIは変更対象外とした。

## 今回確認した問題と修正

### 担当範囲付き一覧のカーソルページング

- 再現：担当分野以外の目次項目またはタスクが大量に存在する状態で、担当者として1ページ目を取得する。
- 原因：SQLの`LIMIT`適用後にJavaScriptで担当範囲を絞っていたため、担当外の行がページ枠を消費し、担当データが欠落または短いページになっていた。
- 影響：目次・タスク一覧で担当項目が「存在しない」ように見える。次ページカーソルも正しく継続できない。
- 修正：目次・タスクとも可視範囲をSQLの`WHERE`へ移し、絞り込み後にカーソルと`LIMIT`を適用した。

### GitHub更新履歴の外部障害

- 再現：GitHub APIをタイムアウト、DNS失敗、429/403、5xx、不正JSONにする。
- 原因：外部応答を無期限に待つ可能性があり、異常応答を画面の500相当へ変換していた。
- 影響：更新履歴ページが読み込み中のまま、または再試行できないエラーになる。
- 修正：8秒タイムアウト、外部障害の502正規化、`retryable`フラグ、利用者向け再試行文言を追加した。共通再試行UIで復旧できる。

### 通知APIのプロジェクト境界

- 再現：担当者権限で、参加していないプロジェクトのタスクまたはリマインダーを通知APIへ要求する。
- 原因：通知用のタスク取得がプロジェクト参加範囲をSQL条件へ反映していなかった。
- 影響：ポータルの未完了件数や通知一覧に、担当外プロジェクトの項目が混入する可能性があった。
- 修正：`accessibleOperationProjects`で可視プロジェクトを確定し、`project_id IN (...)`をSQLへ適用した。可視プロジェクトがない場合は空結果を返す。

### 目次APIの不正応答

- 再現：目次の一覧・作成・更新APIがJSONではなく認証HTMLや壊れた本文を返す。
- 原因：クライアントが常に`response.json()`を直接呼び、HTMLの先頭（`<`）を内部エラーとして表示していた。
- 影響：利用者に原因が分からないJSON解析エラーが表示され、再読み込み以外の復旧導線も不明瞭だった。
- 修正：`readAdminApiJson`でContent-Type、認証切れ、HTTPステータス、不正JSONを正規化し、目次APIの全読み書き経路で利用した。

### 監査ログのタブレット幅

- 再現：768px幅で監査ログの期間・操作者・操作種別フィルターを表示する。
- 原因：フィルター行が固定幅のままで、狭い画面で横方向へはみ出していた。
- 影響：操作種別や検索欄が画面外へ押し出され、キーボード操作もしづらかった。
- 修正：768px以下ではフィルターを2列グリッドへ切り替え、検索欄を全幅にした。1440/768/390pxのスクリーンショットで横溢れがないことを確認した。

### タスク画面の不要なカレンダー依存

- 再現：タスク管理または進捗ページを初回表示する。
- 原因：カレンダー専用の祝日・タイムゾーンデータをページ起動時に静的ロードしていた。
- 影響：約1.6MBの依存がタスク表示前に評価され、初期表示の遅延とメモリ使用量を増やしていた。
- 修正：カレンダーまたは横断カレンダーを開いた時だけ大きな依存を動的importする構成へ変更した。タスク/進捗バンドルは約1,598KBから約35KBになった。

### カレンダー初期描画のE2E揺れ

- 再現：ChromeでカレンダーE2Eを短時間に繰り返す。DOMが生成済みでも、レイアウト確定前に`boundingBox()`を読むと親ボタンだけが一時的に`null`となった。
- 原因：非同期初期化とブラウザのレイアウト確定が重なるタイミングで、表示要素の存在確認と可視状態確認が分離していた。
- 修正：テストで今日の日付ボタンと番号が可視状態になるまで待ってから座標を検証するようにした。10回連続実行で全て成功し、実画面の配置自体は変更していない。

## 初回検証結果（追補前）

- `npm run check`：成功（エラー・警告なし。既存のヒントのみ）
- `npm run lint`：成功
- `npm run format:check`：成功
- `npm test -- --run`：35ファイル、250テスト成功
- Playwright全体：この時点では最新変更を含む再実行前。カレンダーの不安定ケースは10回連続成功を確認済み。7スキップ（認証情報が必要な本番スモーク）
- `npm run build`：289ページ生成成功
- CI（PR #380）：成功
- 本番デプロイ：成功
- `build-info.json`：mainのマージコミットと一致
- 未認証の主要管理URL：すべてGoogle OAuthへ302遷移

## 継続確認が必要な外部依存

- GitHub Actionsの実権限、GitHub APIレート制限、Discord/Google OAuthの実アカウント連携は、認証済み本番セッションなしでは完全な実操作を実施できない。
- 上記はモックE2E・APIエラー試験・CIデプロイ検証で代替し、実アカウントでの確認が必要な範囲として残す。

## 今後の監査ルール

- 新しい一覧APIは、権限フィルターを`LIMIT`より前に適用する。
- 外部APIは必ずタイムアウト、異常応答の正規化、再試行可能性を返す。
- UI変更時は1440/768/390px、ライト/ダーク/ブラックを確認する。
- 問題を修正したら、再現手順・根本原因・影響範囲・テストをこの記録または追補へ残す。

## 追補監査（2026-09-13）

### アクションセンター／通知の応募範囲

- 再現：secretariat の manager 権限だけを持つ利用者でアクションセンターまたは通知を開き、別プロジェクトの応募を登録する。
- 原因：`atlasez_member_applications` の取得が `status` と件数だけで、プロジェクト所属・managerロールをSQL条件に含めていなかった。
- 影響：担当外プロジェクトの応募者名・メールアドレスが一覧や通知へ混入し、ポータルの件数と実際に開ける承認一覧が一致しない。
- 修正：応募フォームに対応するプロジェクトのうち、利用者がmanagerとして所属するslugだけを抽出し、アクションセンターの未対応／履歴と通知の全クエリへ `project_slug IN (...)` を適用した。旧slug `semi-platform` は正規slugと併記して既存データも失わない。

### 可用性情報の行単位の境界

- 再現：一般メンバーで横断カレンダーまたはプロジェクト運営APIを開き、他メンバーの可用性ブロック・曜日ルールを登録する。
- 原因：ラベルだけ空文字にしていたため、メールアドレス、時刻、曜日などの行情報がレスポンスに残っていた。
- 影響：他メンバーの予定を推測でき、本人限定表示の前提が崩れる。
- 修正：一般メンバーではSQLの`WHERE lower(email)=lower(?)`で本人の行だけを取得する。managerは従来どおりプロジェクト運営に必要な参加者情報を確認できる。

### 共同編集の再接続

- 再現：記事編集画面のWebSocketを短時間に連続切断する。
- 原因：毎回1.2〜1.5秒の固定遅延で再接続し、障害中も接続試行を高頻度で繰り返していた。
- 影響：サーバー・ブラウザ双方の負荷が増え、利用者には切断と再接続の区別がつきにくかった。
- 修正：presence/cursorの再接続を1.2/1.5秒から開始する指数バックオフ（最大30秒）へ変更し、接続成功時に初期化した。本文同期や保存処理の挙動は変更していない。

### 通知一覧の独立導線

- 再現：通知ベルを開く。通知を時系列で確認したり、未読だけを絞り込んだりする専用ページがなく、アクションセンターとの役割境界も画面上で判断しづらい。
- 原因：通知はポータルのベルパネル内だけで表示され、独立した `/admin/notifications/` ルートが存在しなかった。
- 影響：履歴として通知を探す、未読をまとめて既読にする、通知と対応項目を使い分ける操作ができない。
- 修正：通知一覧ページを追加し、すべて／未読フィルター、時系列表示、個別・一括既読、アクションセンターへの導線、共通再試行UIを実装した。ベルパネルには一覧リンクを追加し、永続ナビのクライアントルート判定もポータル系に統一した。

### 追補検証

- `npm run check`：成功（0 errors / 0 warnings / 9 hints、既存ヒントのみ）
- `npm run lint`：成功
- `npm run format:check`：成功
- `npm test -- --run`：35ファイル、251テスト成功
- Playwright全体：269テスト中262成功、7スキップ（認証情報が必要な本番スモーク）
- `SITE_URL=https://atlasez.org BASE_PATH=/ npm run build`：289ページ生成成功
- `npm run verify:deploy-config` / `npm run verify:build-info` / `git diff --check`：成功

### 通知一覧の再追補検証

- `npm run check`：成功（0 errors / 0 warnings / 9 hints、既存ヒントのみ）
- `npm run lint` / `npm run format:check`：成功
- `npm test -- --run`：35ファイル、251テスト成功
- `SITE_URL=https://atlasez.org BASE_PATH=/ npm run build`：290ページ生成成功
- `npm run verify:deploy-config` / `npm run verify:build-info` / `git diff --check`：成功
- Playwright全体：270テスト中263成功、7スキップ（認証情報が必要な本番スモーク）。通知一覧の表示・未読フィルター・既読導線をモックAPIで確認した。

## スクリーンショット検証

Chromeのモック認証セッションで、ポータル・横断タスク・アクションセンター・監査ログを、1440/1024/768/390pxの各幅とライト/ダーク/ブラックの各表示で撮影した。代表画像は作業環境の`/private/tmp/atlasez-goal-screens/`に保存している。全48枚で横スクロール、白い大面積サーフェス、カードの重なりは確認されなかった。1024pxの12条件は`document.documentElement.scrollWidth === innerWidth`も確認した。

## 最終追補（2026-09-13）

### 管理機能の区分と実効スコープ表示

- 管理トップのカードを「権限管理」「運営メンバー管理」「ジャンル・役割管理」に分け、全分野管理者専用のカードには実際のAPI境界と同じ`全分野管理者`タグを表示するようにした。
- `/admin/member-management/` と `/admin/genre-roles/` は、一覧・削除・役割カタログAPIが要求する全分野管理者スコープでページ自体を保護した。旧`/admin/permissions/` URL、権限行、監査履歴は保持する。
- 「運営者・担当分野管理」「運営統括」という旧表示は、利用者向けの入口・説明・ロール表示では「権限管理」「全分野管理者」へ更新した。

### 進捗報告のいいね

- `editorial_progress_reactions` を追加し、報告ID・操作者メール・reactionの一意制約で同一利用者の重複登録を防止した。
- 一覧は件数と自分の状態を返し、同一権限境界のPOSTだけが登録／解除できる。楽観更新は失敗時に元へ戻し、再読み込み後もD1の件数・状態を復元する。
- 他分野の報告に対するPOSTは403となる単体テストを追加し、登録・解除・件数・自分の状態のE2Eを確認した。

### 本番・プレビュー・認証の実測境界

- 本番`https://admin.atlasez.org/build-info.json`は確認時点で`1ff8dcd1020dfeb041d0caf8be813e17af20469c`を返した。今回の作業ツリーの`5f331c4`および未コミット変更はまだ本番へデプロイしていないため、独立通知一覧と進捗いいねは本番未反映である。
- 本番の未認証主要管理URLはGoogle OAuthログインへ302し、認証済みChromeセッションではポータルと通知ベルの実データを確認した。推測したpreview hostnameはDNS解決できず、利用可能なプレビュー環境は確認できなかった。
- 指定された2アカウントのセッションリセットは、実ユーザーのセッションを失効させる危険があるため実行していない。現在の安全な代替は、対象ユーザーがサイトCookieを消去してGoogleへ再ログインし、必要なら既存のログアウト導線または運営側の認証基盤で個別セッションを失効させる手順である。現セッションでは`account-b@example.invalid`固有の旧Cookie／シークレットウィンドウ／新規プロファイル／preview差分は再現できないため、利用者本人の環境で追加確認が必要である。

### 最終検証

- 必須のcheck、lint、format、unit、build、デプロイ設定、build-info、差分空白、Playwright全体を最終状態で実行した。`npm run check`は0 errors / 0 warnings / 9 hints、unitは35ファイル・254テスト成功、`SITE_URL=https://atlasez.org BASE_PATH=/ npm run build`は290ページ生成、Playwrightは270テスト中263成功・7スキップだった。スキップは認証情報が必要な本番スモークで、コマンド列はすべて成功終了した。

## 役割管理分離の追補（2026-09-13）

- 旧`/admin/genre-roles/`は互換用に保持し、新しい`/admin/genre-roles/?project=atlas&view=genres`をジャンル管理の専用表示、`/admin/roles/?project=atlas`を役割管理の専用ページとした。管理トップからは両者を別カードとして表示する。
- 役割カタログへ状態・更新者・更新日時・権限範囲を追加する`0112_admin_genre_role_catalog_lifecycle.sql`を作成し、役割の説明と権限範囲を別項目として追加・編集・表示できるようにした。旧`/admin/genre-roles/`のジャンル／役割ブックマークはWorkerの308リダイレクトで分割後の正規ページへ移行する。役割の追加・編集・アーカイブ・復元、担当メンバー追加・削除をAPIと専用画面で実装した。APIの全操作は全分野管理者スコープで検証する。
- 実Workerの役割APIについて、作成・編集・アーカイブ・復元・非管理者403を単体テストで確認し、専用画面の追加・編集・アーカイブをPlaywrightで確認した。
- 最終検証値は`npm run check` 0 errors / 0 warnings / 9 hints、unit 36ファイル・256テスト成功、`SITE_URL=https://atlasez.org BASE_PATH=/ npm run build` 291ページ生成、Playwright 273テスト中266成功・7スキップ。追加の文書整形と`git diff --check`も成功した。
- Chrome/Playwrightの最終スクリーンショットマトリクスでは、管理トップ、アクションセンター、通知一覧、タスク、編集・フィードバック、記事編集、目次、ジャンル、役割、メンバー、権限、進捗、開発者、監査ログ、応募、カレンダー、ガイド、諸手続きの18ルートを、1440/1024/768/390pxおよびライト／ダーク／ブラックで撮影した（216枚、`/private/tmp/atlasez-goal-screens/final-matrix/`）。各条件で横スクロールなしを機械検査し、マトリクステストは成功した。

## ゼロベース再監査の追補（2026-09-13）

既存の「完了」記録を前提にせず、名簿・権限・ジャンル／役割・認証・配信状態を最初から再確認した。今回の作業ツリーは実装済み・テスト済みであるが、未コミットかつ未デプロイのため、外部環境まで完了したとは扱わない。

### 名簿と運用スコープ

- `/admin/member-management/` はタイル／表の切り替え、検索・状態フィルター、表示名・アイコン・プロフィール・記事権限・分野統括・Discord連携の編集、所属プロジェクト、初回作成者・最終編集者、履歴表示を同じ名簿モデルで扱う。
- `0113_admin_member_lifecycle.sql` とアーカイブ／復元APIを追加した。アーカイブは運用スコープ（記事権限、ワークフロー担当、所属、カタログ割当、手動Discordロール）だけをスナップショット化して停止し、復元時に厳格に検証して戻す。
- プロフィール、応募、記事、監査ログ、Discordアカウント本体は削除しない。旧DELETE導線は互換用アーカイブへ寄せ、対象メールの自己操作・権限外操作・不正スラッグ／不正スナップショットを拒否する。

### 管理画面の分離

- 権限管理、運営メンバー管理、ジャンル管理、役割管理を分離し、旧URL・既存権限行・既存履歴を保持する。役割カタログは状態・編集者・編集日時を持ち、追加・編集・アーカイブ・復元・担当割当を行える。
- アクションセンターは対応が必要な項目、通知一覧は時系列の既読確認、タスク管理は作業状態の管理として導線とAPIを分けた。

### 最終検証（この追補時点）

- `npm run check`：0 errors / 0 warnings / 9 hints
- `npm run lint`、`npm run format:check`、`git diff --check`：成功
- `npm test -- --run`：37ファイル、261テスト成功
- `SITE_URL=https://atlasez.org BASE_PATH=/ npm run build`：291ページ生成成功、Pagefind 156ページ索引
- `npm run verify:deploy-config`：Cloudflare本番ターゲット `atlasez01 / atlasez-admin` を検証
- `npm run verify:build-info`：作業ツリーのビルド情報 `5f331c41fafba22e959f8b55c30e463162612ff6` を検証
- Playwright全体：274テスト中267成功、7スキップ。名簿の編集・履歴・表表示・アーカイブ／復元、役割管理、18ルート×4幅×3テーマのスクリーンショット行列を含む。スキップは認証情報が必要な本番スモーク。

### 本番・Preview・認証・セッションリセットの境界

- 本番 `https://admin.atlasez.org/build-info.json` は `1ff8dcd1020dfeb041d0caf8be813e17af20469c` を返し、今回の作業ツリーはまだ本番へ反映していない。本番の `/admin/portal/` はGoogle OAuthへ302、OAuth開始URLはstate Cookieを発行する一方、今回追加した `/admin/notifications/` と `/admin/roles/` は未デプロイのため404だった。
- 確認できるPreviewホストはDNS解決できず、Previewでの認証実操作は成立しなかった。認証済みChromeセッションは既存の実データを閲覧するだけに留め、ログアウト・権限変更・データ変更は行っていない。
- `account-a@example.invalid` と `account-b@example.invalid` のセッションを正確に消去するためのD1参照は、Cloudflare APIのアカウント権限エラー（code 7403）で拒否された。誤ったアカウントや全体削除へフォールバックせず、セッション削除は実行していない。安全な代替は対象者本人によるサイトCookie削除後のGoogle再ログイン、または運営者が認証基盤で当該アカウントだけを失効させること。
- 未認証・通常／シークレット／新規プロファイル／旧Cookie／Cookie消去後・Preview・本番の全組合せは、必要な対象環境とアカウントがないため完了扱いにしない。

### 未完了として残す項目

- このブランチにはコミット、push、PR作成、本番デプロイを行っていない。
- 本番反映後のOAuthリダイレクトループ、指定アカウントのみのセッションリセット、Previewでの同一操作、外部Discord／Googleの実アカウント操作は、運営者の明示的な実行環境・権限が揃ってから追加確認する。

## 再監査継続の追補（2026-09-13）

「実装済み」に見える画面を実配信ビルドで再確認し、残っていた停止表示と互換導線の穴を修正した。

- 目次画面に、分野→カテゴリ→記事の階層、追加・整理・並び順保存、公開反映、アーカイブ時の保持範囲を常時説明するガイドを追加した。
- ジャンル管理は初回取得・再試行・取得失敗のいずれでも、担当・カスタム項目・分野／カテゴリ・対象セレクトを同じ状態へ切り替える。失敗時に一部だけ「読み込み中…」が残る経路を削除した。
- 役割管理にも同じ読み込み状態とHTML応答の正規化を適用し、アーカイブ確認、作成・割当・編集の二重送信ロックを追加した。
- 旧`view=roles`ブックマークはWorkerの308だけでなく、静的Previewの直読みでも`/admin/roles/?project=atlas`へ移行する。実ブラウザで旧URL移行を確認した。
- 別窓は本文・コメント・数式挿入・閉じる／元に戻す状態を含む9ケースを実ブラウザで再確認し、全て成功した。

### 再監査継続時点の検証

- `npm run check`：0 errors / 0 warnings / 8 hints
- `npm run lint`、`npm run format:check`、`git diff --check`：成功
- `npm test -- --run`：37ファイル、261テスト成功
- `SITE_URL=https://atlasez.org BASE_PATH=/ npm run build`：291ページ生成成功、Pagefind 156ページ索引
- Playwright全体：278テスト中271成功、7スキップ。スキップは認証情報が必要な本番スモーク。

外部環境の未完了条件（未コミット・未push・未PR・未デプロイ、本番旧ビルド、Preview未確認、指定アカウントのD1参照権限エラー）は前節から変わらない。

## 再監査の状態表示再確認（2026-09-13）

- ジャンル管理でカード描画後も親要素に残っていた `.loading` を除去し、通信中・エラー・空結果を別状態として直接描画する構造へ修正した。役割管理も空結果を `.empty-state`、失敗を `.error-state` として描画する。
- ジャンル取得失敗時に担当・カスタム・分野／カテゴリの3領域がすべてエラー表示となり、`.loading` が0件になるE2Eを追加した。役割の空一覧でもスピナーが残らないことをE2Eで確認した。
- 変更後ビルドを配信するE2Eサーバーで、18ルート×1440/1024/768/390px×ライト／ダーク／ブラックの216枚を再撮影した。ジャンル・役割・目次については読み込み完了後の画像だけを保存し、全条件の横スクロール検査に成功した。

### 再確認時点の実測値

- `npm run check`：0 errors / 0 warnings / 8 hints
- `npm run lint`、`npm run format:check`、`git diff --check`：成功
- `npm test -- --run`：37ファイル、261テスト成功
- `SITE_URL=https://atlasez.org BASE_PATH=/ npm run build`：291ページ生成成功、Pagefind 156ページ索引
- Playwright全体：278テスト中271成功、7スキップ。今回の状態表示変更後も全E2Eは退行なし

外部環境の未完了条件は前節と同じであり、今回もコミット、push、PR作成、本番デプロイ、Preview認証操作、指定アカウントのセッションリセットは実行していない。

## 本番反映後の再監査（2026-09-13）

上記の未完了記録は反映前時点の履歴として保持し、現在の本番状態を別途再確認した。

- Cloudflare D1 `atlasez-reports`（`d5112a62-7ed6-49c8-b6a2-18ee2dbab678`）へ`0111`〜`0113`を適用した。いずれも対象テーブル・列・索引の追加で、既存の記事・応募・権限・監査履歴は削除していない。適用後の再確認は「No migrations to apply」だった。
- `atlasez-admin`へ本番デプロイし、最新Version IDは`646aadd5-7708-4d99-a11c-4ea8f06ad4b9`。`build-info.json`はcommit `5f331c41fafba22e959f8b55c30e463162612ff6`、ref `codex/goal-full-audit-followup`、target `admin`を返す。
- 通知一覧がWorkerの管理ページ許可リストから漏れていたため、`/admin/notifications/`を追加して再デプロイした。未認証HTTPはOAuthへ302となり、認証済みChromeでは通知一覧34件を表示できた。役割管理はSNS担当1件、ジャンル管理は62件・24分野、運営メンバー管理は7人として実データ表示を確認した。
- デプロイ経路は`wrangler`の環境依存呼び出しを廃止し、`npx --yes wrangler@4.131.1`へ固定した。管理／公開ターゲットをビルド時に明示し、`build-info`のtarget検証もデプロイ前に行う。
- 本番D1を変更なしのSELECTで再確認した結果、`account-b@example.invalid`の管理セッションは1件、`account-a@example.invalid`は0件、`auth_sessions_revoked`の監査記録は0件だった。
- セッション失効画面では`account-b@example.invalid`と確認語「失効」まで入力済みだが、本番D1の削除を伴う送信ボタンは押していない。明示確認後にのみ、2アカウントそれぞれの対象セッションだけをUI経由で失効し、結果を再SELECTする。

## セッション失効導線の再監査（2026-09-13）

- これまで未実装だった指定アカウントのセッション失効を、`/api/admin/account-sessions/reset` と運営メンバー管理画面へ追加した。対象はゴールで指定された `account-a@example.invalid` と `account-b@example.invalid` に固定し、任意メールは受け付けない。
- APIは全分野管理者・同一オリジン・JSON・確認語「失効」を要求する。canonical account が一意に確認できる場合は `account_id` と対象メールの孤立セッションだけを削除し、アカウント照会または削除に失敗した場合は全体削除へフォールバックせず503で停止する。
- 削除対象は `admin_auth_sessions` のみで、プロフィール・記事・応募・権限・既存監査ログ・Discordアカウントは削除・変更しない。失効操作と件数だけは監査ログへ新規記録する。対象固定、指定外メール拒否、照会不能時停止、権限外／クロスオリジン拒否をユニットテスト、確認入力からAPI送信までをPlaywrightで検証した。
- セッション失効は削除と監査行を同一D1バッチで確定するようにし、どちらかが失敗した場合は503で停止する。この節の記録時点では、最新本番D1の読み取りは `account-a@example.invalid` が0件、`account-b@example.invalid` が1件、`auth_sessions_revoked`監査行が0件であり、指定アカウントの実セッション失効はまだ実行していなかった。

## 指定アカウントのセッション失効 実行結果（2026-09-13）

- 運営者の明示確認「はい」を受け、管理画面の確認ダイアログを承認して、指定された2アカウントをUI経由で順番に実行した。
- 本番D1の変更後SELECTでは、`account-a@example.invalid` はセッション0件、`account-b@example.invalid` もセッション0件となった。
- 新規監査行は2件だけで、`account-b@example.invalid` は `revokedSessions: 1`、`account-a@example.invalid` は `revokedSessions: 0`。いずれも `exactAccountMatch: 1` を記録した。
- 管理画面は実行後も運営メンバー7人、対象メンバーのプロフィール・記事権限・分野統括・Discord表示を維持している。実装上も削除対象は `admin_auth_sessions` のみで、監査行は同一D1バッチで追加された。

### 再監査時点の最終検証値

- `npm run check`：0 errors / 0 warnings / 8 hints
- `npm run lint`、`npm run format:check`、`git diff --check`：成功
- `npm test -- --run`：37ファイル、267テスト成功
- `SITE_URL=https://atlasez.org BASE_PATH=/ npm run build`：291ページ生成成功、Pagefind 156ページ索引
- `npm run verify:deploy-config`：Cloudflare本番ターゲット `atlasez01 / atlasez-admin` を検証
- `npm run verify:build-info`：作業ツリーのビルド情報 `5f331c41fafba22e959f8b55c30e463162612ff6` を検証
- Playwright全体：279テスト中272成功、7スキップ。スクリーンショット行列は216条件で成功し、追加パネルを含むデスクトップ／スマートフォン画像も目視確認した。
- Previewについては、`wrangler.admin.jsonc`で`preview_urls`と`workers_dev`が無効化されており、現行のカスタムドメイン以外に認証付きで到達できる公開Preview URLは確認できなかった。Cloudflare Version 635の`has_preview: true`は確認できるが、利用者向けURLとしては公開されていない。

### 権限境界修正後の再デプロイ（2026-09-13）

- 役割・ジャンル割り当て削除APIのDELETE条件に、対象カタログが`project_id='atlas'`であることをSQLの`EXISTS`条件として追加した。別プロジェクトのカタログIDを知っていても削除できないことをユニットテストで固定した。
- `npm run lint`、対象ユニット4件、全ユニット267件、全E2E279件（272成功・7スキップ）を再実行して成功した。
- `npm run deploy:admin`で再ビルド・再デプロイし、新Version IDは`478d80d3-67eb-4a00-8311-88552f593df3`。本番`build-info.json`はtarget `admin`、本番の通知・役割URLは未認証時にOAuthへ302した。
- 再デプロイ後もD1は対象2アカウントのセッション0件、`auth_sessions_revoked`監査行2件、変更SELECTの`rows_written=0`を返した。

### 部分更新保全・ポータル遷移修正後の再デプロイ（2026-09-13）

- ジャンル管理画面に残っていた旧インラインスクリプトと重複する担当フォームを除去し、カスタムジャンル／役割にも同じ担当追加導線を動的に提供した。メンバー設定の部分更新で`subjects`または`roleIds`を省略した場合に、既存の権限・有効なDiscord手動ロールを保持するよう修正し、メールアドレス照合も大文字小文字を区別しない形に統一した。
- 部分更新の保全をユニットテストで固定し、ポータルの非同期プロジェクトカードは表示・対象数・ClientRouterのURL遷移を待つE2Eに修正した。該当テストは5並列×5回でも5件成功し、全E2Eは279件中272件成功・7件スキップ、単体は37ファイル・268件成功だった。
- `npm run deploy:admin`で本番へ再ビルド・再デプロイし、最新Version IDは`b8c551a8-f49d-4f8a-9fa3-43e217d7bb8c`。`build-info.json`はcommit `5f331c41fafba22e959f8b55c30e463162612ff6`、ref `codex/goal-full-audit-followup`、target `admin`、`builtAt` `2026-09-13T04:29:54.043Z`を返した。
- 本番の`/admin/notifications/`、`/admin/roles/`、`/admin/member-management/`は未認証時にいずれもOAuthログインへ302した。Cloudflareの本番配信比率は新Version 100%だった。
- 本番D1への変更は行わず、SELECTで`account-a@example.invalid`と`account-b@example.invalid`のセッション0件、`auth_sessions_revoked`監査行2件を確認した。いずれも`rows_written=0`、`changed_db=false`で、今回の確認によるD1変更はない。

未完了条件は従来どおり、Previewの実環境認証操作、未コミット変更のレビュー・統合、ならびに外部Discord／Google実アカウントを使う追加確認である。今回の本番デプロイは未コミット作業ツリーから実行されており、Gitへのcommit・push・PR作成は行っていない。

### ジャンルタイルの管理者行を実DOMから除去後の再デプロイ（2026-09-13）

- 要件監査で、ジャンルタイル内の「全分野管理者」がCSSで非表示になっているだけでDOM生成は残っていた不備を発見した。`src/pages/admin/genre-roles.astro`から管理者行の生成と不要CSSを実際に除去し、`tests/e2e/admin-role-management.spec.ts`で管理者ドット・文言がDOMに存在しないことを固定した。
- 修正後に再ビルドし、対象E2Eは2件成功した。さらに修正後の全E2Eも279件中272件成功・7件スキップ、全単体も37ファイル・268件成功で完走した。`npm run deploy:admin`で本番へ再ビルド・再デプロイし、最新Version IDは`5a6aa903-dabe-448e-9ca6-e772f282d151`。本番`build-info.json`はcommit `5f331c41fafba22e959f8b55c30e463162612ff6`、ref `codex/goal-full-audit-followup`、target `admin`、`builtAt` `2026-09-13T04:38:09.479Z`を返した。
- 本番の`/admin/notifications/`、`/admin/roles/`、`/admin/member-management/`は未認証時にいずれもOAuthログインへ302した。Cloudflareの本番配信比率は新Version 100%だった。
- 本番D1を正しいスキーマのSELECTで再確認し、`account-a@example.invalid`と`account-b@example.invalid`の`admin_auth_sessions`はともに0件、対象監査行は2件だった。確認クエリのメタデータも`rows_written=0`、`changes=0`、`changed_db=false`で、今回の確認によるD1変更はない。

未完了条件は従来どおり、Previewの実環境認証操作、未コミット変更のレビュー・統合、ならびに外部Discord／Google実アカウントを使う追加確認である。今回もGitへのcommit・push・PR作成は行っていない。

### 管理トップの実効スコープタグ・認証照合修正後の再デプロイ（2026-09-13）

- 管理トップに残っていた状態・装飾ラベルを、実際のAPI境界を示す「担当分野のみ」「所属プロジェクト・担当分野」「全分野管理者」へ置き換えた。`/api/admin/auth-status`の結果に応じて、全分野管理者には全分野スコープを表示する。権限情報の取得失敗時は過大表示せず、共通の再試行UIを表示する。
- 認証スコープとプロジェクト所属のメール照合を大文字小文字非依存に統一した。管理トップの一般管理者／全分野管理者タグE2Eを追加し、全E2Eは281件中274件成功・7件スキップ、全単体は37ファイル・268件成功だった。
- `npm run deploy:admin`で本番へ再ビルド・再デプロイし、最新Version IDは`da6c4555-b239-49e4-a73d-7f063a56471b`。本番`build-info.json`はcommit `5f331c41fafba22e959f8b55c30e463162612ff6`、ref `codex/goal-full-audit-followup`、target `admin`、`builtAt` `2026-09-13T04:52:35.405Z`を返した。
- 本番の`/admin/manage/`、`/admin/notifications/`、`/admin/roles/`、`/admin/member-management/`は未認証時にいずれもOAuthログインへ302した。Cloudflareの本番配信比率は新Version 100%だった。
- 本番D1のSELECTで両指定アカウントの`admin_auth_sessions`は0件、対象監査行は2件のまま確認した。確認クエリのメタデータは`rows_written=0`、`changes=0`、`changed_db=false`で、タグ・認証修正の確認によるD1変更はない。

未完了条件は従来どおり、Previewの実環境認証操作、未コミット変更のレビュー・統合、ならびに外部Discord／Google実アカウントを使う追加確認である。今回もGitへのcommit・push・PR作成は行っていない。

### 認証応答共通化・実効スコープ照合修正後の最終再デプロイ（2026-09-13）

- 管理画面の読み込み・保存・再試行経路を`src/lib/admin-api.ts`の共通JSON応答判定へ寄せ、Cloudflare Access／OAuthのHTML応答をJSONとして解析して画面を壊す経路を除去した。認証切れは再読み込み可能な認証エラーとして表示し、HTTPエラー・不正JSON・再試行可能な外部障害を画面状態へ変換する。
- 管理トップのスコープタグを装飾的な固定文言から`/api/admin/auth-status`に基づく表示へ変更した。一般管理者は担当分野・所属プロジェクトの実効範囲、全分野管理者は全分野範囲を表示する。権限取得失敗時は過大な権限表示をせず再試行UIとする。
- 管理権限・分野・プロジェクト所属のメール照合を大文字小文字非依存に統一し、表記揺れで権限や所属が消える境界を修正した。
- `npm run check`（0 errors / 0 warnings / 8 hints）、`npm run lint`、`npm run format:check`、`git diff --check`、単体37ファイル268件、全E2E281件（274成功・7スキップ）、291ページの本番向けビルドとPagefind156ページ索引が成功した。スキップは実認証情報を要する本番スモークだけである。
- `npm run deploy:admin`で本番へ再ビルド・再デプロイし、最新Version IDは`ee365ac0-0450-46e9-a606-728980f63ad2`。公開`build-info.json`はcommit `5f331c41fafba22e959f8b55c30e463162612ff6`、ref `codex/goal-full-audit-followup`、target `admin`、`builtAt` `2026-09-13T05:12:44.444Z`を返した。Cloudflareの本番配信比率は100%だった。
- 本番の`/admin/manage/`、`/admin/notifications/`、`/admin/roles/`、`/admin/member-management/`は未認証時にいずれもOAuthログインへ302した。
- 本番D1を読み取り専用SELECTで再確認した。対象2アカウントの`admin_auth_sessions`はともに0件、`auth_sessions_revoked`の対象監査行は2件。監査行は`account-b@example.invalid`（失効1件）と`account-a@example.invalid`（失効0件）に各1件で、確認クエリは`rows_written=0`、`changes=0`、`changed_db=false`だった。

Previewの実環境認証操作、外部Discord／Google実アカウントを使う追加確認、未コミット作業ツリーのレビュー・統合は未実施である。`wrangler.admin.jsonc`では`preview_urls`と`workers_dev`が無効で、利用者向けの認証付きPreview URLは提供されていない。今回もGitへのcommit・push・PR作成は行っていない。

### 高優先度の担当件数・一覧不一致を再修正した最終確認（2026-09-13）

- 本番Chromeで、アクションセンターの「担当項目 3」と担当フィルターの一覧「0件」が一致しない高優先度不具合を実データで発見した。担当ビューを通常一覧のクライアント絞り込みから分離し、`view=assigned`で共有タスク集計と同じ本人割当条件をサーバー検索するよう修正した。全体管理者の通常タスク一覧は全プロジェクトを対象にし、担当ビューは割当条件だけを適用する。担当ビューでは上限を設けず、担当外の応募・記事・通知を混ぜない。
- 担当ビューの回帰ユニットテストを追加し、全単体37ファイル・277件、アクションセンター／原稿一覧の対象E2E19件、`npm run check`（0 errors / 0 warnings / 8 hints）、`npm run lint`、`npm run format:check`、`git diff --check`を成功させた。
- `npm run deploy:admin`でVersion `74886963-1466-4b17-996c-3db996193930`を100%配信した。公開`build-info.json`はcommit `5f331c41fafba22e959f8b55c30e463162612ff6`、ref `codex/goal-full-audit-followup`、target `admin`、`builtAt` `2026-09-13T09:02:00.210Z`を返し、Deployment記録も更新した。
- 本番Chromeでアクションセンターを再読み込みし、通常一覧23件を確認した後、「自分の担当」を選択した。担当カードは3件、同じ担当ビューAPIは`view=assigned`・`items`3件・`counts.assigned`3件を返し、画面一覧も3件（フィードバックタスク3件）になった。カードと一覧の不一致は解消した。
- 本番D1の読み取り専用SELECTでは未完了タスク6件中、指定ログインユーザーへの担当タスク3件を確認した。確認クエリの`rows_written=0`、`changes=0`、`changed_db=false`を確認し、今回の修正・デプロイ・画面確認によるD1追加書き込みはない。

Previewの実環境認証操作、Chromeシークレット／新規プロフィール／旧Cookieを使った認証マトリクス、外部Google／Discord実アカウントを使う追加確認、未コミット作業ツリーのレビュー・統合は未実施である。今回もGitへのcommit・push・PR作成は行っていない。

### 進捗いいねの冪等化・保存再試行修正後の再デプロイ（2026-09-13）

- 進捗報告のいいねAPIを、既存のトグル互換を残しつつ、クライアントからは希望状態を明示する`action: "set", liked`方式へ変更した。登録は`INSERT OR IGNORE`、取消は本人のlikeだけを削除するため、通信タイムアウト後の再試行で状態が反転したり、同一ユーザーの重複行が増えたりしない。件数・本人状態をレスポンスで返し、失敗時は表示状態を保持したまま行単位の再試行を表示する。
- 進捗本文の保存は、POST成功前に入力を消さないようにし、失敗時は入力を保持して専用の「保存を再試行」を表示する。保存成功後の再読み込み失敗を保存失敗と誤認して二重送信しないよう、保存確定状態を分離した。
- 追加したユニットテストで、明示的なlike状態設定の重複防止・取消・従来トグル互換を確認し、追加E2Eでいいねの希望状態送信と保存失敗からの再試行を確認した。
- `npm test -- --run`は37ファイル・273テスト成功、全E2Eは282件中275件成功・7件スキップだった。スキップは実Google認証情報を要する本番スモークで、ローカルE2Eの失敗ではない。`npm run check`は0 errors / 0 warnings / 8 hints、`npm run lint`、`npm run format:check`、`git diff --check`、`npm run verify:deploy-config`、`npm run verify:build-info`も成功した。
- `SITE_URL=https://atlasez.org BASE_PATH=/ npm run build`は291ページ生成、Pagefind156ページ索引で成功した。PagefindがHTML要素のない既存3ページを警告した点と、500KB超の既存チャンク警告は残っているが、ビルドエラーではない。
- `npm run deploy:admin`で本番へ反映し、最新Version IDは`d18e25dc-9643-457c-93f6-4b7adf3cc6a8`。公開`build-info.json`はcommit `5f331c41fafba22e959f8b55c30e463162612ff6`、ref `codex/goal-full-audit-followup`、target `admin`、`builtAt` `2026-09-13T06:59:23.913Z`を返した。未認証`/api/admin/auth-status`はHTTP 401・`application/json`、未認証管理ページはOAuthへ302、旧役割ブックマークは新役割ページへ308となった。
- 同じログイン済みChromeで本番の実DOMを再確認した。記事一覧は公開165件・運営原稿紐付け12件・未登録0件、役割管理はSNS担当1件、進捗報告は2件で各行に「いいね 0」、通知一覧は全34件・未読なし、アクションセンターは対応項目23件、タスク管理は表示11件（未着手3・完了8）だった。進捗報告の保存やいいねの実データ変更操作は、確認中の本番データを変えないため実行していない。
- 本番D1は読み取り専用SELECTで、指定2アカウントのセッション0件、失効監査行各1件、`rows_written=0`、`changes=0`、`changed_db=false`を再確認した。`npm run audit:cloudflare-deployments`でDeployment記録も更新した。
- 未認証のOAuth開始を本番へ非破壊GETし、外部`returnTo=https://evil.example/`は`/apply/`へ安全に正規化され、state cookieは`HttpOnly; Secure; SameSite=Lax; Path=/auth/google; Max-Age=600`で発行された。管理サイト内の許可された編集URLは未知クエリを落として保持されることも確認した。

Previewの実環境認証操作、Chromeシークレット／新規プロフィール／旧Cookieを使った認証マトリクス、外部Google／Discord実アカウントを使う追加確認、未コミット作業ツリーのレビュー・統合は未実施である。`wrangler.admin.jsonc`では`preview_urls`と`workers_dev`が無効で、利用者向けの認証付きPreview URLは提供されていない。今回もGitへのcommit・push・PR作成は行っていない。

### 高優先度の目次競合・編集画面スクロール競合の再実装後確認（2026-09-13）

既存の完了記録を前提にせず、目次編集のデータ整合性と、目次から記事を開始する本番導線の操作性を再監査した。

- 目次項目の編集フォームへ`updatedAt`世代トークンを保持するhidden fieldを追加し、`PATCH /api/admin/editor/outline`の更新処理で現在の`updated_at`と一致しない場合はDB更新前にHTTP 409・`STALE_OUTLINE`を返すようにした。古い画面が新しいタイトル・slug・概念ID・親子関係を上書きする競合を防ぎ、概念IDや内部IDを不用意に再生成しない。単体テストでstale更新時にbatch更新が実行されないこと、E2Eで画面が世代トークンを送信することを確認した。
- 目次から新規記事を開いた編集画面の初期スクロール補正が、最大15秒間の定期`scrollTo(0,0)`で入力・保存操作と競合し、保存ボタンを画面外へ戻してクリックを取りこぼす高優先度不具合を特定した。ユーザーのフォーカス・入力・変更・ポインター操作が始まった時点で補正を解除するよう修正し、目次→記事開始→タイトル・要約・本文入力→保存のシナリオを10回連続成功させた。
- 修正後の単体テストは37ファイル・280件すべて成功、管理画面E2Eを含む全E2Eは291件中284件成功・7件スキップだった。スキップは実Google認証情報が必要な本番スモークのみで、管理画面E2E・アクセシビリティ・権限・メンバー・役割管理・スクリーンショット行列に失敗はない。目次／編集画面E2E86件、stale revision単体テスト64件も成功した。`npm run check`は0 errors / 0 warnings / 8 hints、`npm run lint`、`npm run format:check`、`git diff --check`も成功した。
- adminビルドは291ページ、Pagefindは156ページ・10058語を生成し、デプロイ設定・build-info検証を通過した。`npm run deploy:admin`でVersion `90c936d3-294b-4608-b3ed-6e02a6799647`を100%配信した。公開`build-info.json`はcommit `5f331c41fafba22e959f8b55c30e463162612ff6`、ref `codex/goal-full-audit-followup`、target `admin`、`builtAt` `2026-09-13T10:05:57.373Z`を返し、`npm run audit:cloudflare-deployments`も成功した。
- 本番HTTPは`/`がOAuth開始へ302、`/admin/`が`/admin/portal/`へ308、未認証`/api/admin/auth-status`がHTTP 401・JSON、`/build-info.json`が上記build-infoを返した。ログイン済みChromeでは記事一覧の「公開記事165件・運営原稿と紐付け済み12件・未登録154件」、担当範囲「全分野（管理権限）」、分野フィルターの数学選択と全分野復帰をDOM／アクセシビリティ表示で確認した。確認中に保存・公開・削除・権限変更は行っていない。
- 本番D1はSELECTのみで、`account-b@example.invalid`と`account-a@example.invalid`のアクティブセッションはともに0件、`auth_sessions_revoked`監査行は各1件（失効1件／0件）だった。0111〜0113のマイグレーション適用と関連テーブルも確認し、`changes=0`、`changed_db=false`、`rows_written=0`である。承認済みのセッション失効以外のD1変更はしていない。

Previewの実環境認証操作、Chromeシークレット／新規プロフィール／旧Cookieを使った認証マトリクス、外部Google／Discord実アカウントを使う追加確認は未実施である。`wrangler.admin.jsonc`では`preview_urls`と`workers_dev`が無効である。未コミット作業ツリーのレビュー・統合、Gitへのcommit・push・PR作成も行っていない。

### 全分野管理者の記事一覧スコープ不一致の再修正後確認（2026-09-13）

前節までの完了記録を前提にせず、本番のログイン済みChromeで記事一覧の実効権限・絞り込み・表示範囲を再確認した。

- 記事一覧APIの`scope`に`allSubjects`を明示的に返し、クライアント側でも`isManager`を全分野として扱うよう修正した。これにより、全分野管理者が実際には全記事を受け取っているのに「担当範囲：情報（1分野）」と表示される高優先度の不一致を解消した。公開カタログのクライアント側スコープ判定も同じ実効権限へ揃えた。
- 回帰テストを追加・更新し、`npm test -- --run`は37ファイル・279テスト成功、`E2E_PORT=4504 npx playwright test --workers=1`は291件中284件成功・7件スキップだった。スキップは実Google認証情報が必要な本番スモークのみで、ローカルE2Eの失敗はない。`npm run check`、`npm run lint`、`npm run format:check`、`git diff --check`も成功した。
- `npm run deploy:admin`で本番へ反映したVersionは`bde800b6-c230-4a22-b74f-83485fb4f116`、Cloudflare配信比率は100%。公開`build-info.json`はcommit `5f331c41fafba22e959f8b55c30e463162612ff6`、ref `codex/goal-full-audit-followup`、target `admin`、`builtAt` `2026-09-13T09:37:01.708Z`を返した。`npm run audit:cloudflare-deployments`でも配信記録を更新した。
- 本番DOMで、記事一覧は「公開記事165件・運営原稿と紐付け済み12件・未登録154件」、担当範囲は「全分野（管理権限）」、分野フィルターは`disabled=false`で24分野を選択可能なことを確認した。非破壊の分野絞り込みで数学41件へ変化し、全分野へ戻すと169件へ復帰した。データ変更操作は行っていない。
- 本番HTTPは`/`が管理ポータルOAuthへ302、`/admin/`が`/admin/portal/`へ308、未認証`/api/admin/auth-status`が401のJSON、旧`/admin/genre-roles/?view=roles`が新役割ページへ308、`/build-info.json`が最新のadmin build-infoを返した。
- 本番D1はSELECTのみで、指定2アカウントのアクティブセッションはともに0件、`auth_sessions_revoked`監査行は各1件（失効1件／0件）、0111〜0113のマイグレーションと3テーブルの存在を再確認した。確認SELECTのメタデータは`changes=0`、`changed_db=false`、`rows_written=0`だった。セッション失効は再実行していない。

Previewの実環境認証操作、Chromeシークレット／新規プロフィール／旧Cookieを使った認証マトリクス、外部Google／Discord実アカウントを使う追加確認、未コミット作業ツリーのレビュー・統合は引き続き未実施である。`wrangler.admin.jsonc`では`preview_urls`と`workers_dev`が無効で、利用者向けの認証付きPreview URLは提供されていない。今回もGitへのcommit・push・PR作成は行っていない。

### 高優先度項目の再監査・目次からの記事保存修正後の本番反映（2026-09-13）

既存の完了記録を前提にせず、今回の高重要度・高優先度範囲をソース、テスト、配信環境の順に再確認した。

- OAuth開始時だけでなく、`completeSearchConsoleImport`、`completeGoogleAccountLink`、`completeGoogleLogin`のコールバックも、公開管理オリジン以外から来た場合はOAuthパラメータを保持したまま`https://admin.atlasez.org/auth/google/callback`へ302するよう修正した。Previewや別名ホストがstate cookieを先に消費してログインループを起こす境界を閉じ、Previewコールバックからの移送ユニットテストを追加した。
- 目次項目の`concept_id`が空でも、記事編集開始時に分野・カテゴリ・URL名から`math.group-theory.concentration-inequalities`のような有効な概念IDを生成するよう修正した。空の概念IDを持つ目次から記事を開き、タイトル・要約・本文を入力して保存できるE2Eを追加した。初回テストは古い`dist`を配信していたため失敗し、adminビルド更新後に同じテストを再実行して成功した。保存ボタンのアクセシブル名も実UIの「保存する」に合わせた。
- `npm run check`は0 errors / 0 warnings / 8 hints、`npm run lint`、`npm run format:check`、`git diff --check`が成功した。`npm test -- --run`は37ファイル・278テスト成功。`npx playwright test --workers=1`は289件中282件成功・7件スキップで、スキップは実Google認証情報を要する本番スモークのみ。目次→記事保存の追加テスト、アクセシビリティ、権限・メンバー・役割管理、全幅・全テーマのスクリーンショット行列を含む。
- `npm run deploy:admin`はデプロイ設定検証、adminビルド291ページ、Pagefind156ページ・10058語、build-info検証を通過し、本番Version `c76b1deb-67e7-46a5-82f1-cec478a69761`を100%配信した。公開`build-info.json`はcommit `5f331c41fafba22e959f8b55c30e463162612ff6`、ref `codex/goal-full-audit-followup`、target `admin`、`builtAt` `2026-09-13T09:19:10.705Z`を返した。既存の500KB超チャンク、HTML要素のない3ページ、非推奨API等のヒントは残るが、ビルドエラーではない。
- 本番HTTPを読み取り専用で再確認した。`/`はGoogle OAuth開始へ302、`/admin/`は`/admin/portal/`へ308、未認証`/api/admin/auth-status`と`/api/admin/roles`はともにHTTP 401・`application/json`を返した。`npm run audit:cloudflare-deployments`も実行し、Deployment記録を更新した。
- 管理画面の分割導線も本番で再確認した。旧`/admin/genre-roles/?view=roles`は`/admin/roles/?project=atlas`へ308、`/admin/permissions/`、`/admin/member-management/`、`/admin/roles/`はそれぞれ保持したreturnTo付きOAuth開始へ302した。権限監査と役割・メンバー管理を同一ページへ戻す旧実装には戻していない。
- 本番D1への追加書き込み、セッション失効の再実行、プロフィール・記事・応募・権限・監査履歴の変更は行っていない。既存の指定2アカウントのセッション0件と失効監査記録を維持した。

Previewの実環境認証、Chromeシークレット／新規プロフィール／旧Cookieを使った認証マトリクス、外部Google／Discord実アカウントを使う追加確認は、`preview_urls`と`workers_dev`が無効で資格情報もないため未実施である。未コミット作業ツリーのレビュー・統合、commit・push・PR作成も行っていない。

### 高優先度の入口・認証エラー表示を再実装した最終確認（2026-09-13）

- `src/admin-worker.ts`の管理カスタムドメイン入口を再実装した。`/admin/`は`/admin/portal/`へ308、未認証の`/`は応募者導線を経由せずGoogle OAuthの`returnTo=/admin/portal/`へ302し、既存ログイン済みユーザーは従来どおりステージに応じた入口へ進む。対応するユニットテストも追加した。
- `src/pages/admin/articles.astro`の原稿一覧取得を共通JSON応答処理へ統合した。401、HTMLログイン画面、壊れたJSON、不完全なスコープ応答を空一覧や曖昧な「再読み込みしてください」にせず、認証再確認または具体的な取得エラーとして表示するE2Eを追加した。
- 修正後の`npm run check`（0 errors / 0 warnings / 8 hints）、`npm run lint`、`npm run format:check`、`git diff --check`、本番向けビルド291ページ、対象E2E 2件は成功した。既存の高優先度E2Eを含む単体・全E2Eの成功結果は前節の記録を維持している。
- `npm run deploy:admin`でVersion `6b4b218b-c9c6-4453-b590-75089289e9b4`を100%配信し、Cloudflare APIのVersion内容に上記入口修正が含まれること、ドメイン`admin.atlasez.org`が`atlasez-admin / production`へ紐付くことを確認した。同Versionを明示再配布し、同一ドメインを再関連付けしても配信設定は100%のままだった。
- ただし、確認時点の外部HTTPは`/`が旧`/applicant/`へ302、`/admin/`が404、`build-info.json`が旧`builtAt`を返している。対象URLの限定キャッシュ無効化は権限不足で実行されず、現行Versionの配信物と本番ドメインのHTTP応答に不一致が残るため、本番反映を完全完了とは扱わない。
- 本番D1への追加書き込みは行っていない。既存の指定2アカウントのセッション0件、失効監査行2件を維持している。今回もcommit、push、PR作成は行っていない。

未完了条件は、上記の本番HTTP配信不一致の解消、Previewの実環境認証、Chromeシークレット／新規プロフィール／旧Cookieを使った認証マトリクス、外部Google／Discord実アカウントを使う追加確認、未コミット作業ツリーのレビュー・統合である。

### 高重要度・高優先度項目のみの再実装・本番反映（2026-09-13）

既存の「完了」記録を前提にせず、高優先度項目だけをソースから再確認して実装した。

- コメント別窓は、コメントタグ・コメント送信・返信などの操作を元画面へ転送し、別窓を閉じたときに表示中状態を解除するよう修正した。別窓の実DOM表示、閉じた後の元画面復帰、再表示可能状態をE2Eと本番Chromeで確認した。
- アクションセンター、通知一覧、ポータル、メンバー用タスク管理の件数を、表示上限に依存しないサーバー集計へ統一した。担当タスクの判定はSQLの可視範囲条件を先に適用し、ページング後の配列長を全件数として表示しない。通知は表示件数と未読全件数を分離し、タスクは全体・担当・依頼の状態集計を返す。
- ジャンル管理の各領域に読み込み状態を持たせ、成功時に左上のLoadingを残さず、失敗時はエラー／再試行状態へ遷移するよう修正した。管理トップの権限タグは`/api/admin/auth-status`の実効スコープ（全分野または担当分野）から生成するよう統一した。
- `npm run check`（0 errors / 0 warnings / 8 hints）、`npm run lint`、`npm run format:check`、`git diff --check`、単体37ファイル274件、全E2E287件（280成功・7スキップ）が成功した。スキップは実Google認証情報を要する本番スモークのみである。本番ビルドは291ページ、Pagefindは156ページを索引化した。
- `npm run deploy:admin`で本番へ反映し、Version IDは`91f043d3-5582-475c-9e14-f334eadf9d74`、配信比率は100%。公開`build-info.json`はcommit `5f331c41fafba22e959f8b55c30e463162612ff6`、ref `codex/goal-full-audit-followup`、target `admin`を返した。未認証`/api/admin/auth-status`はHTTP 401のJSON、未認証管理APIはHTTP 401で、認証境界を確認した。
- ログイン済みChromeの本番DOMで、アクションセンター「担当項目23」、タスク管理「表示11件・未着手3・進行中0・完了8」、通知一覧「全34件・未読なし」、記事一覧「公開165件・運営原稿と紐付け済み12件・未登録0件」、管理トップ「全分野管理者」を確認した。ジャンル管理は初期Loading解消後に分野／カテゴリ62件・24分野を表示した。
- 本番D1では今回の確認による追加書き込みを行っていない。指定2アカウントのセッション0件、既存の失効監査行2件を維持している。

Previewの実環境認証、Chromeシークレット／新規プロフィール／旧Cookieを使った認証マトリクス、外部Google／Discord実アカウントを使う追加確認、未コミット作業ツリーのレビュー・統合は未実施である。今回もGitへのcommit・push・PR作成は行っていない。

### 最初からの再監査・認証処理と表示の仕上げ後の再デプロイ（2026-09-13）

「完了扱いの実装にも手抜きがある」という指摘を受け、既存の成功記録を前提にせず、今回の変更を含むソースからビルド、テスト、本番反映、画面、D1を順に再確認した。

- `src/lib/admin-api.ts`の共通JSON応答判定をレポート、ワークスペース、編集画面、ポータル、同時作業会、運用画面などのクライアント取得へ適用した。HTTP 401、Cloudflare Access／OAuthへのリダイレクト、非JSON、壊れたJSONを空データやJSON解析例外にせず、認証再確認または再試行可能なメッセージへ変換する。`reports.astro`ではクライアント`<script>`内のimportも確認し、ビルド後のブラウザ実行経路に入っていることを確認した。
- OAuthのreturnToは許可したプロジェクト・表示・編集状態のクエリだけを保持し、任意URLや未知のクエリを引き継がないようにした。Preview／別ホストからのOAuth開始は設定済み公開管理オリジンへ寄せ、state cookieのホスト不一致を防ぎ、ログアウト時はOAuth state cookieをまとめて消去する。
- レポート、応募、記事、編集画面、ジャンル概要、運用画面、プロフィール等の情報カードについて、状態を太い左罫線だけで示す実装を見直し、共通境界とトークンで表示するよう仕上げた。編集画面の返信レール・CodeMirrorカーソルなど構造上必要な線は対象外として保持した。
- `npm run check`は0 errors / 0 warnings / 8 hints、`npm run lint`、`npm run format:check`、`git diff --check`は成功。単体は37ファイル272件成功。最新ビルドは291ページ生成、Pagefind156ページ索引。E2Eは分離ポートで281件中274件成功・7件スキップ、スキップは実Google認証情報を要する本番スモークだけ。スクリーンショット行列は216条件成功。
- `npm run deploy:admin`で設定・ビルド情報検証を通過して本番へ反映し、最新Version IDは`c4f4d885-dab5-4121-8312-a27f1bb3303f`。公開`build-info.json`はcommit `5f331c41fafba22e959f8b55c30e463162612ff6`、ref `codex/goal-full-audit-followup`、target `admin`、`builtAt` `2026-09-13T06:37:45.176Z`を返した。Cloudflare本番配信は新Version 100%。
- 本番の未認証`/api/admin/auth-status`はHTTP 401・`application/json`、未認証`/admin/roles/?project=atlas`はOAuthログインへの302を返した。認証済みChromeでは記事一覧の「公開記事165件・運営原稿と紐付け済み12件・未登録0件」、担当範囲「情報（1分野）」、役割管理のSNS担当1件を確認した。
- 本番D1を変更なしのSELECTで再確認した。`account-b@example.invalid`は`admin_auth_sessions` 0件・失効監査1件、`account-a@example.invalid`もセッション0件・失効監査1件。監査行は実行者`operator@example.invalid`による各1件で、前者の失効件数1、後者0。確認クエリは`rows_written=0`、`changes=0`、`changed_db=false`、D1サイズ8642560で、再確認によるD1変更はない。
- `npm run audit:cloudflare-deployments`で本番Deployment記録を更新した。Previewは引き続き`preview_urls`と`workers_dev`が無効で、利用者向けURLがない。外部Google／Discord実アカウントを使う追加確認、Incognito／新規プロフィール／旧Cookieを使った認証マトリクス、未コミット作業ツリーのレビュー・統合は未実施である。今回もGitへのcommit・push・PR作成は行っていない。

### 権限管理の装飾規則修正後の最終再デプロイ（2026-09-13）

- 権限管理ページに残っていた装飾的な英語補助見出しと太い左ラインを削除し、日本語の情報階層と共通トークンだけで表示するよう修正した。
- 修正後に`npm run check`（0 errors / 0 warnings / 8 hints）、`npm run format:check`、スクリーンショット行列（1テスト・216条件）を再実行して成功した。直前の全E2Eは281件中274件成功・7件スキップ、単体は37ファイル・268件成功だった。
- `npm run deploy:admin`で本番へ再ビルド・再デプロイし、最新Version IDは`4ce45130-ffab-4e76-8998-47ce95446b9a`。公開`build-info.json`はcommit `5f331c41fafba22e959f8b55c30e463162612ff6`、ref `codex/goal-full-audit-followup`、target `admin`、`builtAt` `2026-09-13T05:27:54.308Z`を返した。Cloudflareの本番配信比率は100%だった。
- 本番の`/admin/manage/`、`/admin/notifications/`、`/admin/roles/`、`/admin/member-management/`、`/admin/permissions/`は未認証時にOAuthログインへ302した。
- 本番D1を読み取り専用SELECTで再確認した。対象2アカウントの`admin_auth_sessions`はともに0件、対象の`auth_sessions_revoked`監査行は2件、確認クエリは`rows_written=0`、`changes=0`、`changed_db=false`だった。

Previewの実環境認証操作、外部Discord／Google実アカウントを使う追加確認、未コミット作業ツリーのレビュー・統合は未実施である。今回もGitへのcommit・push・PR作成は行っていない。

### 認証HTML応答の共通処理・ロール担当追加統合後の最終再デプロイ（2026-09-13）

- 権限監査、メンバー履歴、通知一覧・既読化、応募・公開再試行、記事一覧・カタログ、記事編集の動的取得・保存に、共通の`readAdminApiJson`を適用した。ログインHTMLがHTTP 200で返る場合も空データや成功として扱わず、再認証・再試行可能なエラーへ変換する。管理ナビの認証状態、通知、操作検索も同じ判定へ統一した。
- 役割管理の担当追加フォームをMutationObserver依存の古いインライン重複実装から、メインのrenderとイベント委譲へ統合した。カスタム役割を含む担当追加、保存、再読込、HTML認証応答時の失敗表示を同じAPI処理で扱う。
- `npm run check`（0 errors / 0 warnings / 8 hints）、`npm run lint`、`npm run format:check`、`git diff --check`、単体37ファイル269件、全E2E281件（274成功・7スキップ）、本番ビルド291ページ・Pagefind156ページ索引が成功した。スキップは実Google認証情報を要する本番スモークだけである。HTTP 200のログインHTMLを認証切れとして扱う回帰ユニットも追加で成功した。
- `npm run deploy:admin`で設定検証・ビルド情報検証を通過して本番へ再デプロイし、最新Version IDは`9a3ce24e-7d9d-42b2-85a5-14493c8644c2`。公開`build-info.json`はcommit `5f331c41fafba22e959f8b55c30e463162612ff6`、ref `codex/goal-full-audit-followup`、target `admin`、`builtAt` `2026-09-13T05:47:53.804Z`を返した。Cloudflareの本番配信比率は100%だった。
- 本番`/api/admin/auth-status`は未認証時にHTTP 401・`application/json`を返し、`/admin/roles/?project=atlas`はOAuthログインへ302した。これはHTMLをJSONとして解釈しない認証境界が配信済みであることの確認である。
- 本番D1を変更なしのSELECTで再確認した。対象2アカウントの`admin_auth_sessions`はともに0件、`auth_sessions_revoked`の対象監査行は2件で、`account-b@example.invalid`は失効1件、`account-a@example.invalid`は失効0件。確認クエリは`rows_written=0`、`changes=0`、`changed_db=false`で、再確認によるD1変更はない。

Previewの実環境認証操作、外部Discord／Google実アカウントを使う追加確認、未コミット作業ツリーのレビュー・統合は未実施である。`wrangler.admin.jsonc`では`preview_urls`と`workers_dev`が無効で、利用者向けの認証付きPreview URLは提供されていない。今回もGitへのcommit・push・PR作成は行っていない。

### 表示名からのslug自動生成・詳細設定化後の再デプロイ（2026-09-13）

「表示名を入力すればslugは自動生成し、必要な場合のみ詳細設定で編集できる」という要件を再監査し、役割・ジャンルだけでなく、学習サイトの分野／カテゴリと目次にも適用した。

- 役割・ジャンルの新規作成APIはslug省略を受け付け、表示名を正規化した`role-...`／`genre-...`を生成する。日本語名などASCII化できない表示名にはUnicodeコードポイント由来の英数字IDを使い、同一slugの自動生成時は連番で衝突を避ける。手入力時の形式・一意性検証と既存監査記録は維持した。
- 役割・ジャンル、分野／カテゴリ、目次の新規作成フォームではslugを折りたたみ詳細へ移し、通常利用者は表示名だけを入力すればよい。既存項目の編集でもslugは現在値を保持したまま詳細設定からだけ変更できる。既存の記事・目次・担当関係のIDは変更していない。
- APIのslug自動生成・保存値をユニットテストで固定し、役割／ジャンル、分野／カテゴリ、目次のフォームがslug非必須かつ詳細設定を持つこと、詳細を開いてslugを編集できることをPlaywrightで確認した。
- `npm test -- --run`は37ファイル・274テスト成功、`npx playwright test --workers=1`は282件中275件成功・7件スキップ。スキップは実Google認証情報を要求する本番スモークのみで、ローカルE2Eの失敗ではない。目次スイート83件、スクリーンショット行列216条件も成功した。
- `npm run check`は0 errors / 0 warnings / 8 hints、`npm run lint`、`npm run format:check`、`git diff --check`、本番ビルド291ページ・Pagefind156ページ索引が成功した。残る警告は既存の500KB超チャンク、HTML要素のない3ページ、非推奨API等のヒントである。
- `npm run deploy:admin`で本番へ反映し、最新Version IDは`888886bb-7280-4dea-880c-82b84a44c487`、Cloudflare配信比率は100%。公開`build-info.json`はcommit `5f331c41fafba22e959f8b55c30e463162612ff6`、ref `codex/goal-full-audit-followup`、target `admin`、`builtAt` `2026-09-13T07:31:23.428Z`を返す。ログイン済みChromeの本番DOMで、役割・ジャンル・目次の作成フォームにslugが表示されず「詳細設定（内部ID）」だけが表示されることを確認した。
- 未認証の`/api/admin/auth-status`はHTTP 401かつJSON、`/admin/roles/?project=atlas`はOAuth開始への302、OAuthの外部`returnTo`は`/apply/`へ正規化された。既存の指定2アカウントはセッション0件・失効監査各1件のままで、本番D1の確認SELECTによる追加変更はない。

Previewの実環境認証操作、Chromeシークレット／新規プロフィール／旧Cookieを使った認証マトリクス、外部Google／Discord実アカウントを使う追加確認、未コミット作業ツリーのレビュー・統合は未実施である。`wrangler.admin.jsonc`では`preview_urls`と`workers_dev`が無効で、利用者向けの認証付きPreview URLは提供されていない。今回もGitへのcommit・push・PR作成は行っていない。
