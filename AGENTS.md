# Atlasez 開発エージェント向け指示

このファイルは、LLMや自動化エージェントがこのリポジトリを変更するときの最小ルールです。詳細は [`docs/DEVELOPMENT_GUIDE.md`](docs/DEVELOPMENT_GUIDE.md) を必ず確認してください。

## 作業前

- `git status` で既存の未コミット変更を確認し、他人の変更を破棄しない。
- 対象が公式サイト、学習サイト、メンバー用サイト、学習サイト運営用サイト、Worker/D1のどれかを明示する。
- Secret、個人情報、本番D1データを読み出してログ・コード・コミットに残さない。

## 実装ルール

- UIは共通部品と既存のデザイントークンを優先して使う。
- 権限はUIの非表示だけでなくWorker APIでも検証する。
- 記事・概念・分野slugを変更するときはリンクと学習地図への影響を調べる。
- D1は新しい連番migrationを追加し、既存migrationを書き換えない。
- 記事の言語保存単位はISO 639-3（`jpn`, `eng`など）。
- ビルド成果物`dist/`を手編集しない。

## 確認

変更後は少なくとも次を実行する。

```bash
npm run check
npm run lint
npm test -- --run
npm run build
git diff --check
```

UIや学習地図を変更した場合は `npm run test:e2e` とPC/スマホ幅の目視確認も行う。完了報告には、変更ファイル、テスト結果、未解決の制約、デプロイ要否を記載する。
