# Atlasez 運営サイト開発ルール

## 絶対ルール

このリポジトリの変更は、必ずGitHub Pull Requestを経由して`main`へ反映する。

- `main`へ直接pushしない。
- ローカルで`main`へmergeしてからpushしない。
- エージェントはPull Requestを自動mergeしない。
- 変更は必ずトピックブランチで行い、push、Pull Request、CIとCloudflare Previewの確認、人間レビューを経てから、GitHub上で人間がmergeする。
- このルールは文言変更、設定変更、ドキュメント変更を含むすべての変更に適用する。

## 常時バージョン管理

すべての変更は、Cloudflare Workers Buildsでバージョン化する。通常の変更で本番Workerへ直接`wrangler deploy`してはいけない。

1. `main`からトピックブランチを作る。
2. 変更をコミットしてGitHubへpushする。
3. Pull Requestを作成する。
4. GitHub ActionsのCIとCloudflare Workers BuildsのPreviewを確認する。
5. Preview URLで動作を確認し、人間レビューを受ける。
6. 人間がGitHub上でPull Requestをmergeする。
7. `main`へのmergeを契機にCloudflareが本番Workerをデプロイする。

非mainブランチには、ブランチalias URLと固定version-prefix URLが発行される。URLはPull Requestの説明またはCloudflareのBuild結果に記録する。Preview URLは本番ではなく、必要に応じてCloudflare Accessで保護する。

## 作業前後の確認

- 作業前に`git status`を確認し、既存の変更を破棄しない。
- Secret、個人情報、本番D1データをログ・コード・コミットに残さない。
- `dist/`を手編集しない。
- 変更後は少なくとも`npm run check`、`npm run lint`、`npm test -- --run`、`npm run build`、`git diff --check`を実行する。
- 完了報告には変更ファイル、Preview URL、テスト結果、未解決の制約、Pull Request URLを記載する。
