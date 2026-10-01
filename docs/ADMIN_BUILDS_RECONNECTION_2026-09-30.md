# ADMIN Workers Builds 再接続レビュー

## 確認した状態

2026-09-30に正本Cloudflare Accountの`atlasez-admin`設定画面を読み取り確認した。
Gitリポジトリは未接続、ランタイムCacheは無効、Workers Logs/Tracesは無効だった。
既存Gitアカウント`Atlasez`には`Admin-Atlesez`が選択肢として存在する。

- GitHub main: `b4767cbb23f45b4783a74b837b5e31b70b5d9e84`
- 公開build-info: `74084dc6147490fef228b6a1f68ae3fedae79ba7`
- 配信Version: `2f9440ea-e4e3-4689-89d0-c8d27ac7d95f`（100%、2026-09-29T10:57:58.588Z）
- CLI Source: `Unknown (version_upload)` / `Unknown (deployment)`
- 追跡: https://github.com/Atlasez/Admin-Atlesez/issues/407

## 適用する設定案

| 項目              | 値                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| Account           | `812021e62fa20465950b61be55dfe064`                                                                  |
| Worker            | `atlasez-admin`                                                                                     |
| Git repository    | `Atlasez/Admin-Atlesez`                                                                             |
| Production branch | `main`                                                                                              |
| Root directory    | `/`                                                                                                 |
| Build command     | `npm ci && ATLASEZ_BUILD_TARGET=admin SITE_URL=https://admin.atlasez.org BASE_PATH=/ npm run build` |
| Deploy command    | `npx wrangler deploy --config wrangler.admin.jsonc --keep-vars`                                     |
| Preview builds    | 無効                                                                                                |
| Build cache       | 無効                                                                                                |

Worker、Custom Domain、D1、Durable Objectの変更は含まない。
接続フォームの詳細設定では「新しいトークンが自動的に作成されます」と表示された。
最終接続前に、Workers Builds用APIトークンの作成・権限・対象Accountについて明示承認が必要。
接続操作は初回ビルドと本番Deployを開始し得るため、この設定案のPRレビューを先に完了する。

## 検証・停止条件

1. mainのCI成功とレビュー済みSHAを確認する。
2. 承認済み設定で接続し、Git repository / branch / command / cacheを再確認する。
3. Build/Deployログに対象SHAと`atlasez-admin`が記録されることを確認する。
4. Version ID、100%配信、公開build-infoのSHAを照合する。
5. 認証済みChromeでポータル、横断タスク、横断カレンダー、マイページ、管理トップ、記事一覧を確認する。

内部エラー、CI失敗、SHA不一致、別Worker/Account、想定外Versionの場合は本番更新を停止し、Issue #407へ証拠を記録する。
手動deploy、Version promote、cache purge、Route変更で代替しない。

## 復旧方法

接続に失敗した場合は既存配信Versionを保持し、エラーと時刻を記録する。
誤った接続設定が保存された場合は自動ビルドを停止し、変更前の未接続状態へ戻す設定案をレビューする。
既存配信のrollbackはこのPRの承認に含まれず、対象Versionと影響を確定して別途レビューする。
