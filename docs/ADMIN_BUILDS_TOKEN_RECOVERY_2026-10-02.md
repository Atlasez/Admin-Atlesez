# Workers Builds接続復旧の追加検討

追跡: [Issue #407](https://github.com/Atlasez/Admin-Atlesez/issues/407)。固定値・停止条件は[`ADMIN_DEPLOYMENT_POLICY.md`](ADMIN_DEPLOYMENT_POLICY.md)を正本とする。これは追加案のレビュー資料であり、Cloudflare設定の適用記録ではない。

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

## 既存ユーザー権限内でのtoken候補と制約

[公式仕様](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)は独自のユーザーAPI tokenを許可する。新規自動作成の既定権限にはAccount Settings Readが含まれる。アカウント所有tokenはBuildsで未対応。

Cloudflareの現行Developer Platform権限資料はAPI tokenにWorker単位の`Editor` scopeを付け、既存Workerをdeployできると説明している。ただし、その説明がWorkers Buildsで利用可能なuser-scoped tokenにも適用できるかは資料上明確でない。現地で確認したProfile > API Tokensのユーザーtoken作成UIはAccount / Zone / User resourceだけで、個別Worker scopeを提示しなかった。Workers Builds設定資料はBuilds tokenについて現在user tokenのみ対応し、account-owned tokenには未対応と明記している。よって現在の公式記述とUIからは、個別Worker scopeを持ちBuildsが受け付けるtokenを確定できていない。Deploy時にD1 bindingの別権限が不要な点はWorkers権限資料で確認できる。

現時点でWorker単位のleast-privilege tokenをWorkers Buildsが受け付ける方法は確認できていない。Account-wide `Workers Scripts Edit` とzone-wide `Workers Routes Edit` のclassic user token案は権限がADMIN以外にも及ぶため、推奨せず、作成もしない。次にCloudflare account ownerまたはSupportへ、(a) 個別Worker Editor scopeをuser-scoped API tokenに設定できるか、(b) そのtokenをWorkers Buildsが受け付けるか、を確認する。回答が得られるまでtoken・接続は作成しない。このPRは問い合わせ・credential作成・設定変更を許可しない。

| 項目           | 候補値                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| 候補           | 個別Worker `Editor` scopeをuser-scoped API tokenに設定し、Workers Buildsへ登録できる方法。どちらも未確認  |
| 対象           | 固定Account内の`atlasez-admin`だけに限定できる方式をCloudflareへ照会する。                                |
| 必要権限       | 既存WorkerのDeployに必要な`Editor`。Route/Custom Domainを変更する権限は追加しない。                       |
| 有効期間       | Cloudflare側の制限と更新担当を確認してから決定。                                                          |
| 追加しない権限 | account-wide Workers Scripts Edit、Account Settings Read、D1 Edit、KV/R2、他Account、他Zone、Worker Admin |
| 状態           | 候補検討のみ。token名・権限・期間を確定せず、作成・登録していない。                                       |

公式資料: [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[Workers roles and permissions](https://developers.cloudflare.com/workers/authorization/workers/)、[Developer Platform authorization](https://developers.cloudflare.com/workers/authorization/)。Worker scopeをAPI tokenに付ける説明は[2026-09-15更新のpermissions guide](https://developers.cloudflare.com/workers/authorization/)を参照するが、Buildsで用いるuser-scoped tokenへの適用方法は未確定。

Account-wide classic user tokenへ広げるfallbackは採用しない。Account owner / SupportからWorker-scoped tokenを提案された場合でも、まずそのtoken種別がWorkers Buildsで使えることを公式資料または検証で確認する。Builds pickerに有効な最小scope tokenが現れない場合は接続しない。token文字列をチャット、Issue、PR、ログへ貼らない。

## 候補が使えない場合

Cloudflare ownerまたはSupportへの機能確認が必要。問い合わせには日時、Worker、固定Account、permission group、秘密値を除いたerrorを使う。管理者のパスワードを借りたり、広いclassic tokenを作ったり、別Account・別Workerへ本番を移したり、通常経路を手動deployに置き換えたりしない。

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

接続操作は初回本番deployを開始し得る。Worker単体scopeのBuild token手段が確認され、設定PRレビューが終わった後、Cloudflareへの送信直前にGitHub `main`の最新HEAD SHAとCI状態を取得して記録する。保存直後にBuildが別SHAを選んだ、CIが未成功のcommitを対象にした、または対象SHAが確認時点の最新レビュー済みmainでない場合は停止する。公開`build-info.json`、Build/Deployログ、Worker名 `atlasez-admin`、Version、100%配信、Chrome主要6画面のすべてが一致しない場合も停止する。失敗時は現在の配信を保持し、設定の取消・token失効も影響を記録してから行う。既存tokenの編集・削除はこの案に含めない。
