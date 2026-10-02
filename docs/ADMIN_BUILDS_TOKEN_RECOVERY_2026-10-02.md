# Workers Builds接続復旧の追加検討

追跡: [Issue #407](https://github.com/Atlasez/Admin-Atlesez/issues/407)。設定値・停止条件は[既存の接続レビュー](ADMIN_BUILDS_RECONNECTION_2026-09-30.md)を維持する。これは追加案のレビュー資料であり、Cloudflare設定の適用記録ではない。

## 確認できたこと

- 固定Account `812021e62fa20465950b61be55dfe064` の `atlasez-admin` はGit未接続。
- 接続画面のAPI token欄は自動作成だけを表示し、既存の選択候補はない。
- ユーザーAPI token一覧には `Atlasez Admin GitHub Deploy` がある。設定の読み取りで固定Account、D1 Edit、Workers Scripts Edit、Zone Workers Routes Editを確認。変更・再発行・秘密値の表示は実施していない。
- Issueの自動作成失敗はAccount Settings Readのpermission check。現在の担当者はDNS/Workers Platform Adminであり、不足権限を自己付与できない。
- CLIは既存OAuthで固定Accountを参照できるが、Workers Builds用のユーザーAPI tokenを選択できることとは別である。

## 現在の権限で試せる候補

[公式仕様](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)は独自のユーザーAPI tokenを許可する。新規自動作成の既定権限にはAccount Settings Readが含まれる。アカウント所有tokenはBuildsで未対応。

別途レビュー・作成直前の承認後、既存権限の範囲で専用ユーザーtokenを手動作成し、Buildsの選択候補に現れるか確認する案を検討する。

| 項目            | 候補値                                                        |
| --------------- | ------------------------------------------------------------- |
| 名前            | `Atlasez Admin Workers Builds 2026-10-02`                     |
| Accountリソース | 固定Accountのみ                                               |
| Account権限     | Workers Scripts Edit、D1 Edit                                 |
| Zoneリソース    | `atlasez.org`のみ                                             |
| Zone権限        | Workers Routes Edit、Zone Read                                |
| User権限        | User Details Read、Memberships Read（本人のみ）               |
| 有効期間        | 作成から30日。更新担当と更新方法を記録する                    |
| 追加しない権限  | Account Settings、他Account、全Zone、R2/KV、所有者/管理者権限 |

この従来形式のWorkers Scripts Editは固定Account内の他Workerにも適用される。用途をADMIN接続に限定し、秘密値を他の実行系へ渡さない。これは既存のユーザー権限を超える案ではないが、新しい認証情報を作るため実行直前の承認が必要。選択候補になること、Buildsの初回deployが成功することは未実証。tokenが候補に現れない、permission checkが失敗する場合は停止し、権限を推測で増やさない。API tokenの文字列をチャット、Issue、PR、ログへ貼らない。

## 候補が使えない場合

固定Accountの所有者または権限を委任できる担当者による既存接続案の実行、もしくはCloudflareへの障害問い合わせが必要。問い合わせには日時、Worker、固定Account、permission group、秘密値を除いたerrorを使う。管理者のパスワードを借りたり、別Account・別Workerへ本番を移したり、通常経路を手動deployに置き換えたりしない。

## 適用と復旧

CI成功・レビュー済みmainを対象に、既存資料のproduction branch `main`、root `/`、固定build/deployコマンド、preview/cache無効を使用する。接続操作は初回本番deployを開始し得るため、設定レビューを完了してから行う。SHA、Worker、Version、100%配信、Chrome主要画面が一致しない場合は停止する。失敗時は現在の配信を保持し、設定の取消・token失効も影響を確定してレビューする。既存tokenの編集・削除はこの案に含めない。
