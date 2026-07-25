# アクセシビリティ（ACCESSIBILITY）

目標: WCAG 2.2 AA。

## 実装済み事項

- セマンティックHTML（`header/nav/main/article/aside/footer`、見出し階層）
- Skip to content（全ページ、最初のTabで出現）
- キーボードのみでの操作（折り畳みは`<details>`、カスタムUIは`button`要素）
- `:focus-visible` による明確なフォーカスリング（橙 `#b3560e`、3px）
- フォームラベル（`label[for]` / `fieldset+legend`）
- 画像の代替テキスト（装飾ロゴは`alt=""`＋隣接テキスト）
- 色だけに依存しない表現（難易度・状態は必ずテキストバッジ、グラフのエッジは線種＋矢印＋凡例）
- コントラスト: 本文 #1c1c1c/#fff（約16:1）、二次テキスト #55524c（約7:1）
- 200%拡大: すべての寸法をremベース、`--text-scale`で文字だけの拡大にも対応
- `prefers-reduced-motion` / `prefers-color-scheme` を尊重（手動設定が優先）
- タッチターゲット `--touch-target: 44px`
- 検索・絞り込みの結果件数を `aria-live="polite"` で通知
- `lang="ja"` / `lang="en"`、言語切替リンクに `hreflang`・`lang`
- 学習地図: グラフ（`role="application"`）に依存せず、階層リスト・表・経路検索フォームで同一情報と操作を提供。JS無効時も本文・ナビ・リスト表示が動作

## 表示設定パネル（`src/components/A11ySettings.astro`）

文字サイズ（標準/大/特大）、コントラスト（標準/高）、背景（白/低刺激色/暗色）、
行間（標準/広い）、アニメーション（標準/軽減）、フォント（標準/可読性重視）。

- `localStorage`（キー `atlasez-prefs`）に保存し、`BaseHead` のインラインスクリプトがペイント前に復元
- OS設定（ダークモード・motion軽減）は未設定時の初期値として尊重
- すべての設定はCSSカスタムプロパティの上書きで実現し、レイアウトを壊さない

## 検査

- 自動: Playwright + axe-core（`tests/e2e/accessibility.spec.ts`、wcag2a/aa・wcag21aa・wcag22aaタグ）をCIで実行
- 手動チェックリスト（リリース前）:
  - キーボードだけで記事到達・検索・経路検索・表示設定変更ができる
  - スクリーンリーダー（VoiceOver/NVDA）でパンくず・目次・記事情報が読める
  - 360px幅で横スクロールが発生しない（コード・数式・表を除く）
  - 200%ズームで機能が失われない
