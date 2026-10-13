# 取り込み記事の作成主体

## データの意味

`editorial_documents.creator_kind`を記事の作成主体として保存する。`organization`は「Atlasez運営」、`person`は従来の個人作成者として表示する。組織の記事には個人の作成者アバターを表示しない。

`created_by`は従来から権限判定にも使う登録担当者の記録として保持する。`updated_by`、編集履歴、カタログの`registered_by`、本文、状態、権限は変更しない。個人の執筆数・個人作業一覧には組織の記事を含めない。

公開記事を新規に運営へ取り込む際は`organization`を保存する。個人の新規原稿・更新案は既定値`person`とし、既存原稿へのリンクはその作成主体を維持する。カタログ観測・同じ原稿への再登録は取り込み方式の証跡を保持する。

## 既存記事の識別

migration `0124_editorial_document_creator_kind.sql`は、カタログ取り込み専用の決定的IDを持つ正規原稿を対象とする。UUIDのversion形状だけを証拠にしない。適用前に、全候補のIDが元のカタログ`identity_key`のSHA-256から生成したIDに完全一致することを検証する。

現在の記事分類が変更されていても、取り込み時のカタログidentityで検証する。`registration_method`は過去の観測で上書きされているため、それだけでは判定しない。出典IDがある個人原稿、更新案、由来を確定できない旧UUIDv4原稿は組織へ変更しない。

追加調査で旧方式のUUIDv4取り込み3件を確定した。作成以前の公開main祖先commit `fae16b9828c8f9942c41b77d9230c6f0722229f7`の記事と、sourceArticleId・元identity・本文（当時の保存処理と同じJS trim）が一致した。1件は初期revisionも一致し、他2件はrevisionがない。旧editor/Workerはこの公開本文をUUIDv4と操作者created_byで保存していた。`scripts/editorial-legacy-imports.json`に公開情報だけの証拠と3件の固定IDを保存し、migration0125はcanonical・固定ID・sourceArticleId・作成時刻を全て一致させて作成主体だけ補正する。sourceArticleIdがNULLの旧原稿15件は変更しない。

preflightは未追加のcreator_kind列があれば0124をsimulateし、0125もsimulateする。0124適用済みDBでは0125だけをsimulateする。旧3件が存在すればmetadataを照合し、未補正の記事は本文hashも一致させる。配信後の監査は3件のmetadataを照合してorganizationを確認するが、その後の本文編集・分類変更を妨げない。

## 0124/0125適用時の手順記録（履歴）

以下は、このデータmigrationを計画した時点の適用条件・検証内容を残す履歴であり、現在のmigration実行手順や適用許可ではない。2026-10-12の固定D1に対する読み取り専用migration listでは未適用なしと記録されている。現在の状態は作業時に[実運用準備監査](ADMIN_OPERATIONAL_READINESS_2026-10-12.md)と固定D1のmigration listを再確認する。0124/0125を再適用しない。

当時の手順記録には、次の安全確認が含まれていた。

1. コード・migration・対象条件・検証結果をPRとCIで確認してmainへ反映する。
2. 旧記録ではActionsのdeploy検証とGitHub `production` Environment承認を前提にしていた。この配信経路は現在の通常配信経路ではない。ADMINの現行通常配信は[ADMINデプロイ運用方針](ADMIN_DEPLOYMENT_POLICY.md)に従い、mainをProduction branchとしたCloudflare Workers Buildsだけを使う。
3. 固定Account・D1を指定し、所有者限定のリポジトリ外ディレクトリへD1 SQL exportを保存する。exportはchmod 600とし、内容をログ・Issue・GitHubへ載せない。
4. `scripts/verify-d1-export.mjs`で復元・整合性を検証し、`scripts/verify-editorial-creator-backfill.mjs`で候補の完全hash一致、既存列・カタログ不変性を検証する。
5. 適用時点のmainと固定D1でmigration listを確認し、未適用一覧・候補ID集合がレビュー済みの期待値と一致する場合に対象migrationだけを適用する。0124・0125は別PRで扱う記録になっている。想定外の候補・migration・不整合があれば停止する。
6. 適用後の非公開exportで既存原稿の列・カタログ・件数とDB整合性を照合し、追加列が旧Workerと共存することを確認する。
7. 旧記録のproduction Environment承認・Actions配信は現行手順として使用しない。コード反映、Workers Builds run・checkout SHA・固定Worker Version・100%配信・公開build-info・認証済みChromeの照合は、現行ポリシーに従う。
8. 配信後の非公開exportを`node scripts/verify-editorial-creator-backfill.mjs /absolute/private/after-deploy.sql --verify-applied`で検証する計画が記録されていた。組織主体でない確定候補が残る場合は完了扱いにせず、snapshotで確定したIDだけを対象とする補正migrationを別PRで扱う。

通常のBuild/Deployへmigrationを含めない。将来のD1変更はバックアップ・隔離検証・共有D1と旧Workerへの互換性・明示した適用／復旧手順を別途用意し、[ADMIN D1のバックアップと復元](ADMIN_D1_RECOVERY.md)に従う。記事ごとの未レビュー直接更新は行わない。

## 復旧

問題があれば本番反映を停止する。コードは修正・revertをPRでmainへ反映し、[ADMINデプロイ運用方針](ADMIN_DEPLOYMENT_POLICY.md)に定めるWorkers Buildsで照合する。互換性のある追加列は残す。作成主体のデータを戻す必要がある場合は、適用直前exportで完全hashを検証したIDだけを対象に`creator_kind`を戻す別migrationをPRでレビューする。以後に取り込んだ記事や編集を消さず、データベース全体の復元や列の削除を通常の復旧に使わない。

## 0125追補の履歴

0125は上記3件だけを補正するデータmigrationで、WorkerコードやCloudflare設定は変更しない。旧記録では、別PRのCI、直前backup/preflight、pending一覧、前後exportの全既存列・catalog・FK/integrity、全164候補のmetadata/fullhash/organization、個人原稿28件の維持を確認する計画だった。記録内のproduction Environment承認とActions配信は現行の通常経路ではなく、現在の操作指示ではない。0125は2026-10-12の固定D1 migration listで未適用なしと確認されている。再適用・直接更新をせず、今後の変更は現行の[ADMINデプロイ運用方針](ADMIN_DEPLOYMENT_POLICY.md)と[実運用準備監査](ADMIN_OPERATIONAL_READINESS_2026-10-12.md)を参照する。
