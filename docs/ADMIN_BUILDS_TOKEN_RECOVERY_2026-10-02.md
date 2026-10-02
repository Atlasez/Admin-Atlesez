# Workers Builds接続復旧の追加検討

追跡: [Issue #407](https://github.com/Atlasez/Admin-Atlesez/issues/407)。設定値・停止条件は[既存の接続レビュー](ADMIN_BUILDS_RECONNECTION_2026-09-30.md)を維持する。これは追加案のレビュー資料であり、Cloudflare設定の適用記録ではない。

## 確認できたこと

- 固定Account `812021e62fa20465950b61be55dfe064` の `atlasez-admin` はGit未接続。
- 接続画面のAPI token欄は自動作成だけを表示し、既存の選択候補はない。
- ユーザーAPI token一覧には `Atlasez Admin GitHub Deploy` がある。設定の読み取りで固定Account、D1 Edit、Workers Scripts Edit、Zone Workers Routes Editを確認。変更・再発行・秘密値の表示は実施していない。
- Issueの自動作成失敗はAccount Settings Readのpermission check。現在の担当者はDNS/Workers Platform Adminであり、不足権限を自己付与できない。
- CLIは既存OAuthで固定Accountを参照できるが、Workers Builds用のユーザーAPI tokenを選択できることとは別である。

## 2026-10-02 Dashboard再確認

正しい固定AccountとWorker `atlasez-admin` のSettings > Buildsを読み取り確認した。

- Gitは未接続。接続フォームは `Atlasez / Admin-Atlesez / main` を表示した。
- 接続前の初期値はbuild `npm run build`、deploy `npx wrangler deploy`、preview有効。固定運用値と一致しないため、これらのまま接続しない。
- API token pickerには「新しいトークンを作成する」のみが表示され、プロフィールに存在する既存user tokenを選べなかった。
- フォームは送信せずキャンセルした。token作成、GitHub認可、Builds設定保存、Build起動は行っていない。
- 自動token作成が`Account Settings Read`のpermission checkで失敗した既存記録はIssue #407を参照。

## 最小権限の専用ユーザーtoken候補

[公式仕様](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)は独自のユーザーAPI tokenを許可する。新規自動作成の既定権限にはAccount Settings Readが含まれる。アカウント所有tokenはBuildsで未対応。

Cloudflare公式Workers権限は、既存WorkerのDeployにWorker単体のEditor、Route/Custom Domainを変更する場合に該当zoneのWorkers Routes Writeを案内する。また、WorkerにD1 bindingがある場合でもDeployにD1データへの別権限は不要としている。Buildsはuser tokenのみ対応し、自動作成tokenは全Worker・KV/R2・全zone向けの広いscopeを含む。

次の専用user token案は、新規credential作成前にPRレビューする。プロフィールからのtoken作成とBuildsへの登録はsecurity-sensitiveな外部設定変更で、**このPRだけでは許可も適用もしない**。

| 項目            | 候補値                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| 名前            | `Atlasez Admin Workers Builds 2026-10-02`                                                                        |
| Accountリソース | 固定Accountのみ                                                                                                  |
| Accountリソース | 固定Accountのみ                                                                                                  |
| Worker権限      | Worker `atlasez-admin` 単体のEditor                                                                              |
| Zoneリソース    | `atlasez.org`のみ                                                                                                |
| Zone権限        | Route/Custom Domain更新に必要なWorkers Routes Write                                                              |
| User権限        | 既定では追加しない。Cloudflareの検証ログが要求する場合のみ、User Details ReadとMemberships Readを本人scopeで検討 |
| 有効期間        | 初回Builds検証に使える範囲で最短。作成時に表示される期限を記録し、更新担当が決まらなければ適用しない             |
| 追加しない権限  | Account Settings Read、D1 Edit、全Worker/全Account/全Zone、KV/R2、所有者/管理者権限                              |

公式資料: [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[Workers roles and permissions](https://developers.cloudflare.com/workers/authorization/workers/)、[Developer Platform authorization](https://developers.cloudflare.com/workers/authorization/)。

Worker/zone単位scopeのAPI tokenをBuilds pickerが受け入れるかは未検証。権限作成で`Account Settings Read`を要求された場合、token作成を中止し、Account ownerまたはCloudflare Supportへ回す。UIが単一Worker/zoneへscopeできなければ作成しない。期限の前に更新する担当が決まらない場合も作成しない。API token文字列をチャット、Issue、PR、ログへ貼らない。

## 候補が使えない場合

固定Accountの所有者または権限を委任できる担当者による既存接続案の実行、もしくはCloudflareへの障害問い合わせが必要。問い合わせには日時、Worker、固定Account、permission group、秘密値を除いたerrorを使う。管理者のパスワードを借りたり、別Account・別Workerへ本番を移したり、通常経路を手動deployに置き換えたりしない。

## 適用と復旧

CI成功・レビュー済みmainを対象に、次の固定値を設定する。

```text
Git repository: Atlasez/Admin-Atlesez
Production branch: main
Root directory: /
Build: npm ci && ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ npm run build
Deploy: npx wrangler deploy --config wrangler.admin.jsonc --keep-vars
Preview builds: disabled
Build cache: disabled
```

接続操作は初回本番deployを開始し得る。設定PRレビュー後、Cloudflareへの送信直前に明示承認を確認し、SHA `cabd861396c4c6af6208cf4357462876289d32df` のmain Buildを監視する。公開`build-info.json`、Build/Deployログ、Worker名 `atlasez-admin`、Version、100%配信、Chrome主要6画面のすべてが一致しない場合は停止する。失敗時は現在の配信を保持し、設定の取消・token失効も影響を記録してから行う。既存tokenの編集・削除はこの案に含めない。
