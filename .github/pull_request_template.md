## 変更内容

<!-- 何を変更し、なぜ変更したかを書いてください。 -->

## 対象範囲

- [ ] 運営Worker
- [ ] 管理画面UI
- [ ] D1 / migration
- [ ] ドキュメント / 設定

## Previewと検証

- Preview URL（ブランチalias）:
- Preview URL（固定version-prefix、必要な場合）:
- [ ] Cloudflare Workers Buildsが成功した
- [ ] `npm run check`
- [ ] `npm run lint`
- [ ] `npm test -- --run`
- [ ] `npm run build`
- [ ] `git diff --check`

## セキュリティ・データ

- [ ] Secret、個人情報、本番D1データを差分やログに含めていない
- [ ] 権限変更またはmigrationがある場合、影響とロールバック方法を記載した

## 未解決の制約

<!-- 残る制約がなければ「なし」と書いてください。 -->

## マージ確認

- [ ] `main`へ直接pushしていない
- [ ] 人間レビューを受けた
- [ ] このPull Requestをエージェントが自動mergeしない
