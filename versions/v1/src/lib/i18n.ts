/** 学習サイトの多言語対応（UIラベルとロケールユーティリティ） */

export const LOCALES = ["ja", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const localeNames: Record<Locale, string> = {
  ja: "日本語",
  en: "English",
};

const ui = {
  ja: {
    siteName: "学習サイト「アトラス」",
    siteTagline: "一人一人の自学自習をみんなで支える学習サイト",
    subjects: "分野",
    map: "学習地図",
    search: "検索",
    team: "運営紹介",
    bookmarks: "あとで読む",
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
  },
  en: {
    siteName: "Atlas Learning Site",
    siteTagline: "A learning site where everyone supports self-study",
    subjects: "Subjects",
    map: "Learning Map",
    search: "Search",
    team: "Team",
    bookmarks: "Reading list",
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
  locale: Locale,
): string {
  if (locale === "en" && name.en) return name.en;
  return name.ja;
}
