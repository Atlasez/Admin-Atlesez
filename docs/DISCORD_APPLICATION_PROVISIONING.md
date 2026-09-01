# 応募者のDiscord自動参加

応募者が応募者画面の「Discordと連携」を一度実行すると、Discord OAuth2の同意を受けて連携情報を暗号化して保存します。運営が応募を承認すると、Botが対象サーバーへユーザーを追加し、既存のDiscordロールと運営サイトの希望分野・所属区分・所属機関・学年・関心分野を照合して対象メンバーへ付与します。

サーバー参加または既存ロールの付与に失敗した場合は、応募画面に状態と原因を表示し、5分、30分、2時間、12時間、24時間、48時間の間隔で最大6回まで自動再試行します。初回の失敗と成功は応募者へメールキューで通知します。メールキュー自体も既存の仕組みにより再試行されます。

## Discord側の設定

Discord Developer PortalでOAuth2のRedirect URIに次を登録します。

```text
https://admin.atlasez.org/auth/discord/callback
```

OAuth2 scopeは `identify` と `guilds.join` を使用します。Botは対象サーバーに参加させ、対象サーバーを読み取れる権限と既存ロールをメンバーへ付与するManage Roles権限を与え、付与対象ロールより上位に配置してください。運営サイトの「Discordの既存ロールを読み込む」はDiscordのロール一覧をGETし、同名ロールのIDを運営サイトのD1対応表へ保存するだけです。ロールの作成・改名・削除は行いません。`guilds.join` の同意を得たユーザーをBot経由で追加できる状態であることも確認してください。

## ロールの対応

Discordを正とし、運営サイトは次の対応表を読み取って保持します。

- 分野担当：Discordロール名と学習サイトの分野名
- 所属区分：Discordロール名と応募フォームの所属区分
- 所属機関：Discordロール名と運営者プロフィールの所属機関
- 学年：Discordロール名と運営者プロフィールの学年
- 関心分野：Discordロール名と運営者プロフィールの関心分野

対応するDiscordロールがない項目は運営サイト側で「未対応」として表示します。運営サイトからDiscordへロールを追加して補完することはありません。Discord側のロールを変更した場合は、管理画面から再読み込みして対応表を更新します。応募承認時とプロフィール同期時は、この対応表にある既存ロールを対象メンバーへ付与しますが、ロール定義自体は変更しません。

## Discord側からの同期

運営サイトとDiscordを連携済みのメンバーは、5分ごとの定期処理でDiscordの現在のロールを読み取ります。対応表に登録された分野ロールがDiscord側で外された場合は、運営サイトの対応する分野権限も削除します。所属機関・学年・関心分野に対応するロールを外した場合は、運営サイト側の該当属性を空に戻します。運営サイトで明示的に割り当てたロールも、Discord側で外された時点で割当を無効化するため、後続の保存操作で意図せず再付与されません。

Discord APIまたは対象メンバーの取得に失敗した場合は、その回の同期では運営サイト側の権限を変更しません。対応表にないロールは運営権限へ変換せず、そのまま維持します。

管理Workerには次のSecretを登録します。値の登録は本番設定を変更するため、リポジトリや `wrangler.admin.jsonc` には書かず、GitHub Actionsの `Configure admin Discord secrets` を `main` から確認付きで実行します。

```text
DISCORD_OAUTH_CLIENT_SECRET
DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY
DISCORD_BOT_TOKEN
```

対象サーバーは `wrangler.admin.jsonc` の公開設定で固定しています。応募者のプロジェクト所属は運営サイトのプロジェクトメンバーシップへ保存し、Discord側では対象サーバー内の既存ロール（分野・所属など）を付与します。

```text
DISCORD_GUILD_ID=1359062450028282017
DISCORD_GUILD_NAME=Atlasez学習サイト運営
DISCORD_OAUTH_CLIENT_ID=1537142952210464868
```

GitHubの `production` Environmentには、次の3つのSecretを登録します。Client SecretとBot TokenはDiscord Developer Portalから再表示できないため、既存値が分からない場合は、既存連携への影響を確認してからDiscord側で再発行してください。再発行した値はチャットやリポジトリへ貼り付けません。

```text
DISCORD_OAUTH_CLIENT_SECRET
DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY
DISCORD_BOT_TOKEN
```

`DISCORD_GUILD_ID`などの公開設定を変更した場合は、PRで対象名とIDの対応をレビューしてからMergeします。設定WorkflowはSecretだけを書き込み、WorkerコードのデプロイやD1マイグレーションは行いません。

`DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY` は32バイトのランダム値をbase64または64桁hexで指定します。D1にはDiscordのアクセストークンとリフレッシュトークンを平文で保存せず、AES-GCMで暗号化した値だけを保存します。

OAuthアプリの設定やSecretが未登録の場合、連携開始は503で停止し、既存の応募・運営画面は壊れません。承認後のDiscord同期に必要なユーザーIDはOAuth連携で取得するため、運営がDiscord IDを手入力する必要はありません。
