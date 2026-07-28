/** 学習サイトの多言語対応（UIラベルとロケールユーティリティ） */

/**
 * 公開するロケール。
 *
 * 英語版は翻訳が 4 記事しかなく、日本語版との差が大きすぎたため一旦取り下げた。
 * 再開するときはここに "en" を戻し、`src/content/articles/en/` に記事を置けば
 * ルーティング・言語切替・hreflang はそのまま動く（UI 文言は下の ui.en に残置）。
 */
export const LOCALES = ["ja"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * ロケールの表示メタデータ。
 *
 * 将来的に十数言語以上を並べても崩れないよう、切替UIは「母語表記＋英語表記」を
 * 持つこの表だけを見て描画する。言語を増やすときはここに1行足し、LOCALES に
 * コードを加えるだけでよい（UIレイアウトの変更は不要）。
 * dir を "rtl" にすればアラビア語などにも対応できる。
 */
export interface LocaleMeta {
  /** 母語での表記（例: 日本語） */
  native: string;
  /** 英語での表記（例: Japanese）。検索・並べ替えに使う */
  english: string;
  /** 書字方向 */
  dir?: "ltr" | "rtl";
}

export const localeMeta: Record<string, LocaleMeta> = {
  ja: { native: "日本語", english: "Japanese" },
  en: { native: "English", english: "English" },
  "zh-Hans": { native: "简体中文", english: "Chinese (Simplified)" },
  "zh-Hant": { native: "繁體中文", english: "Chinese (Traditional)" },
  ko: { native: "한국어", english: "Korean" },
  es: { native: "Español", english: "Spanish" },
  fr: { native: "Français", english: "French" },
  de: { native: "Deutsch", english: "German" },
  pt: { native: "Português", english: "Portuguese" },
  it: { native: "Italiano", english: "Italian" },
  ru: { native: "Русский", english: "Russian" },
  vi: { native: "Tiếng Việt", english: "Vietnamese" },
  th: { native: "ไทย", english: "Thai" },
  id: { native: "Bahasa Indonesia", english: "Indonesian" },
  hi: { native: "हिन्दी", english: "Hindi" },
  ar: { native: "العربية", english: "Arabic", dir: "rtl" },
};

/** 後方互換: コード → 母語表記 */
export const localeNames: Record<string, string> = Object.fromEntries(
  Object.entries(localeMeta).map(([code, meta]) => [code, meta.native]),
);

/** 未登録のコードでもコードそのものを返して落とさない */
export function localeLabel(code: string): string {
  return localeMeta[code]?.native ?? code;
}

export function localeDir(code: string): "ltr" | "rtl" {
  return localeMeta[code]?.dir ?? "ltr";
}

const ui = {
  ja: {
    siteName: "学習サイト「アトラス」",
    siteTagline: "一人一人の自学自習をみんなで支える学習サイト",
    subjects: "分野",
    map: "学習地図",
    search: "検索",
    team: "運営紹介",
    bookmarks: "あとで読む",
    learningList: "学習リスト",
    learningListHint:
      "あとで読む・読んだ・理解したの記録です。この端末のブラウザ内にのみ保存され、サーバーには送られません。",
    exportRecords: "書き出し",
    importRecords: "読み込み",
    importDone: "読み込みました",
    importFailed: "読み込めませんでした",
    saveForLater: "あとで読む",
    saved: "保存済み",
    removeBookmark: "削除",
    noBookmarks:
      "保存した記事はまだありません。記事ページの「あとで読む」で保存できます。",
    clearBookmarks: "すべて削除",
    bookmarksHint: "保存した記事はこの端末のブラウザ内にのみ記録されます。",
    settings: "表示設定",
    breadcrumbHome: "アトラス",
    articles: "記事",
    published: "公開中",
    preparing: "準備中",
    difficulty: "難易度",
    "difficulty.introductory": "入門",
    "difficulty.basic": "基礎",
    "difficulty.intermediate": "標準",
    "difficulty.advanced": "発展",
    estimatedMinutes: "推定学習時間",
    minutes: "分",
    prerequisites: "前提知識",
    relatedArticles: "関連記事",
    nextArticles: "次に読む",
    prerequisiteArticles: "前提記事",
    readArticle: "記事を読む",
    preExercise: "事前演習",
    postExercise: "事後演習",
    exercisePreparing: "演習は準備中です",
    authors: "執筆",
    reviewers: "査読",
    updatedAt: "最終更新",
    toc: "目次",
    languages: "言語",
    noTranslation: "この言語版はまだありません",
    availableIn: "利用可能な言語",
    altArticles: "代替記事",
    sourceArticle: "元記事",
    reportIssue: "この記事の問題を報告",
    editOnGitHub: "GitHubで編集履歴を見る",
    references: "参考文献",
    gridView: "グリッド",
    listView: "リスト",
    filter: "絞り込み",
    allCategories: "すべてのカテゴリ",
    allDifficulties: "すべての難易度",
    searchPlaceholder: "記事名・キーワードで検索",
    recentArticles: "最近更新された記事",
    forBeginners: "はじめての方へ",
    openMap: "学習地図を開く",
    articleCount: "公開記事数",
    operatedBy: "運営",
    backToTop: "総合ホームへ",
    skipToContent: "本文へ移動",
    conceptsCovered: "この記事で扱う概念",
    routeSearch: "学習ルート検索",
    routeStart: "開始地点（理解している概念）",
    routeGoal: "目的地点（理解したい概念）",
    routeCompute: "経路を表示",
    routeResult: "学習経路",
    routeSkipped: "理解済みとして省略",
    routeAlternatives: "代替経路",
    graphView: "グラフ表示",
    listAlternative: "リスト表示（グラフの代替）",
    tableAlternative: "表形式",
    legend: "凡例",
    "edge.prerequisite": "前提",
    "edge.recommended-next": "次に推奨",
    "edge.related": "関連",
    "edge.part-of": "包含",
    "edge.alternative": "代替",
    resetView: "初期位置へ戻る",
    fitView: "全体表示",
    shareView: "この表示を共有",
    category: "カテゴリ",
    status: "公開状態",
    all: "すべて",
    tileView: "タイル表示",
    listViewTab: "リスト表示",
    viewSwitcher: "表示の切り替え",
    selectLanguage: "言語を選択",
    searchLabel: "サイト内検索",
    openSearch: "検索を開く",
    closeMenu: "閉じる",
    upcomingArticles: "近日公開予定の記事",
    noUpcoming: "近日公開予定の記事はありません。",
    history: "学習の記録",
    learningRecord: "学習の記録",
    progressInProgress: "執筆中",
    progressNotStarted: "未着手",
    markRead: "読んだ",
    markUnderstood: "理解した",
    stateRead: "読んだ",
    stateUnderstood: "理解した",
    historyHint:
      "読んだ・理解した記事はこの端末のブラウザ内にのみ記録されます。",
    noHistory:
      "記録はまだありません。記事ページの「読んだ」「理解した」で記録できます。",
    clearHistory: "すべて削除",
    filterAll: "すべて",
    remove: "削除",
  },
  en: {
    siteName: "Atlas Learning Site",
    siteTagline: "A learning site where everyone supports self-study",
    subjects: "Subjects",
    map: "Learning Map",
    search: "Search",
    team: "Team",
    bookmarks: "Reading list",
    learningList: "Learning list",
    learningListHint:
      "Your reading list and learning record. Stored only in this browser; nothing is sent to a server.",
    exportRecords: "Export",
    importRecords: "Import",
    importDone: "Imported",
    importFailed: "Could not import",
    saveForLater: "Save for later",
    saved: "Saved",
    removeBookmark: "Remove",
    noBookmarks:
      "No saved articles yet. Use “Save for later” on any article page.",
    clearBookmarks: "Clear all",
    bookmarksHint:
      "Saved articles are stored only in this browser on this device.",
    settings: "Display settings",
    breadcrumbHome: "Atlas",
    articles: "Articles",
    published: "Published",
    preparing: "In preparation",
    difficulty: "Difficulty",
    "difficulty.introductory": "Introductory",
    "difficulty.basic": "Basic",
    "difficulty.intermediate": "Intermediate",
    "difficulty.advanced": "Advanced",
    estimatedMinutes: "Estimated time",
    minutes: "min",
    prerequisites: "Prerequisites",
    relatedArticles: "Related articles",
    nextArticles: "Read next",
    prerequisiteArticles: "Prerequisite articles",
    readArticle: "Read article",
    preExercise: "Pre-exercise",
    postExercise: "Post-exercise",
    exercisePreparing: "Exercises coming soon",
    authors: "Authors",
    reviewers: "Reviewers",
    updatedAt: "Last updated",
    toc: "Contents",
    languages: "Languages",
    noTranslation: "Not yet available in this language",
    availableIn: "Available in",
    altArticles: "Alternative articles",
    sourceArticle: "Original article",
    reportIssue: "Report an issue",
    editOnGitHub: "View history on GitHub",
    references: "References",
    gridView: "Grid",
    listView: "List",
    filter: "Filter",
    allCategories: "All categories",
    allDifficulties: "All difficulties",
    searchPlaceholder: "Search articles",
    recentArticles: "Recently updated",
    forBeginners: "For beginners",
    openMap: "Open the learning map",
    articleCount: "Published articles",
    operatedBy: "Operated by",
    backToTop: "Back to home",
    skipToContent: "Skip to content",
    conceptsCovered: "Concepts covered",
    routeSearch: "Learning route search",
    routeStart: "Start (concepts you understand)",
    routeGoal: "Goal (concept you want to understand)",
    routeCompute: "Show route",
    routeResult: "Learning route",
    routeSkipped: "Skipped (already understood)",
    routeAlternatives: "Alternatives",
    graphView: "Graph view",
    listAlternative: "List view (graph alternative)",
    tableAlternative: "Table view",
    legend: "Legend",
    "edge.prerequisite": "Prerequisite",
    "edge.recommended-next": "Recommended next",
    "edge.related": "Related",
    "edge.part-of": "Part of",
    "edge.alternative": "Alternative",
    resetView: "Reset view",
    fitView: "Fit to screen",
    shareView: "Share this view",
    category: "Category",
    status: "Status",
    all: "All",
    tileView: "Tiles",
    listViewTab: "List",
    viewSwitcher: "Switch view",
    selectLanguage: "Select language",
    searchLabel: "Search this site",
    openSearch: "Open search",
    closeMenu: "Close",
    upcomingArticles: "Coming soon",
    noUpcoming: "No upcoming articles.",
    history: "Learning record",
    learningRecord: "Learning record",
    progressInProgress: "In progress",
    progressNotStarted: "Not started",
    markRead: "Read",
    markUnderstood: "Understood",
    stateRead: "Read",
    stateUnderstood: "Understood",
    historyHint:
      "Your reading record is stored only in this browser on this device.",
    noHistory:
      "Nothing recorded yet. Use “Read” or “Understood” on any article page.",
    clearHistory: "Clear all",
    filterAll: "All",
    remove: "Remove",
  },
} as const;

export type UiKey = keyof (typeof ui)["ja"];

export function t(locale: Locale, key: UiKey): string {
  return ui[locale][key] ?? ui.ja[key];
}

/** 難易度ラベル（テンプレート内での型アサーション回避用ヘルパー） */
export function difficultyLabel(locale: Locale, difficulty: string): string {
  return t(locale, `difficulty.${difficulty}` as UiKey);
}

/** エッジ種別ラベル */
export function edgeLabel(locale: Locale, kind: string): string {
  return t(locale, `edge.${kind}` as UiKey);
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** 多言語ラベルからロケールに応じた表示名を返す（英語がなければ日本語へフォールバック） */
export function localizedName(
  name: { ja: string; en?: string },
  locale: string,
): string {
  if (locale === "en" && name.en) return name.en;
  return name.ja;
}
