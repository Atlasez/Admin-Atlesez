# 応募者のDiscord自動参加

応募者が応募者画面の「Discordと連携」を一度実行すると、Discord OAuth2の同意を受けて連携情報を暗号化して保存します。運営が応募を承認すると、Botが対象サーバーへユーザーを追加し、応募時の希望分野・所属区分・所属機関・学年・関心分野に対応するロールを付与します。

サーバー参加またはロール設定に失敗した場合は、応募画面に状態と原因を表示し、5分、30分、2時間、12時間、24時間、48時間の間隔で最大6回まで自動再試行します。初回の失敗と成功は応募者へメールキューで通知します。メールキュー自体も既存の仕組みにより再試行されます。

## Discord側の設定

Discord Developer PortalでOAuth2のRedirect URIに次を登録します。

```text
https://admin.atlasez.org/auth/discord/callback
```

OAuth2 scopeは `identify` と `guilds.join` を使用します。Botは対象サーバーに参加させ、ロール作成・付与を行うためのManage Roles権限を与え、付与対象ロールより上位に配置してください。`guilds.join` の同意を得たユーザーをBot経由で追加できる状態であることも確認してください。

管理Workerには次の値をSecretとして登録します。値の登録は本番反映を伴うため、GitHub Actionsの管理手順で行い、リポジトリや `wrangler.admin.jsonc` には書きません。

```text
DISCORD_OAUTH_CLIENT_ID
DISCORD_OAUTH_CLIENT_SECRET
DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY
DISCORD_BOT_TOKEN
DISCORD_GUILD_ID
```

`DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY` は32バイトのランダム値をbase64または64桁hexで指定します。D1にはDiscordのアクセストークンとリフレッシュトークンを平文で保存せず、AES-GCMで暗号化した値だけを保存します。

OAuthアプリの設定やSecretが未登録の場合、連携開始は503で停止し、既存の応募・運営画面や手動のDiscord ID確認機能は壊れません。
