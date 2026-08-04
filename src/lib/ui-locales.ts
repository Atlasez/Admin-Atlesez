/**
 * UI 表示言語の辞書。
 *
 * 記事本文は日本語のままで、画面まわりの文字だけを切り替える。
 * URL は変えず、表示設定（localStorage）で選ぶ。記事が日本語しかない現状で
 * `/atlas/en/` のような経路を増やすと、同じ内容のページが言語の数だけ
 * 生成されて重複コンテンツになるため、この方式にしている。
 *
 * キーは日本語の表示文字そのもの。ビルド後の HTML を走査して
 * `node scripts/check-ui-translations.mjs` で網羅状況を確認できる。
 */

export const UI_LANGUAGES = ["ja", "en", "zh", "ko"] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

export const UI_LANGUAGE_NAMES: Record<UiLanguage, string> = {
  ja: "日本語",
  en: "English",
  zh: "中文",
  ko: "한국어",
};

/** 表示設定で、現在の言語と異なる言語名に添える英語表記。 */
export const UI_LANGUAGE_ENGLISH_NAMES: Record<UiLanguage, string> = {
  ja: "Japanese",
  en: "English",
  zh: "Chinese",
  ko: "Korean",
};

/** 日本語表示中に添える各言語の日本語名。 */
export const UI_LANGUAGE_JAPANESE_NAMES: Record<UiLanguage, string> = {
  ja: "日本語",
  en: "英語",
  zh: "中国語",
  ko: "韓国語",
};

/** 日本語 → 各言語。ja は原文なので持たない。 */
export const UI_DICTIONARY: Record<
  string,
  Record<"en" | "zh" | "ko", string>
> = {
  // --- サイト名・共通 ---
  アトラス: { en: "Atlas", zh: "Atlas", ko: "Atlas" },
  "学習サイト「アトラス」": {
    en: "Atlas Learning Site",
    zh: "Atlas 学习网站",
    ko: "Atlas 학습 사이트",
  },
  "学習サイト アトラス": {
    en: "Atlas Learning Site",
    zh: "Atlas 学习网站",
    ko: "Atlas 학습 사이트",
  },
  一人一人の自学自習をみんなで支える学習サイト: {
    en: "A learning site where everyone supports self-study",
    zh: "大家共同支持每个人自主学习的学习网站",
    ko: "모두가 각자의 자기주도 학습을 함께 돕는 학습 사이트",
  },
  "未来の学びを創る。学びで未来を創る。": {
    en: "Create the learning of the future. Create the future through learning.",
    zh: "创造未来的学习。以学习创造未来。",
    ko: "미래의 배움을 만든다. 배움으로 미래를 만든다.",
  },
  "運営:": { en: "Operated by:", zh: "运营:", ko: "운영:" },
  本文へ移動: {
    en: "Skip to content",
    zh: "跳到正文",
    ko: "본문으로 이동",
  },
  プライバシーポリシー: {
    en: "Privacy Policy",
    zh: "隐私政策",
    ko: "개인정보처리방침",
  },
  "Atlasez お知らせ": {
    en: "Atlasez News",
    zh: "Atlasez 公告",
    ko: "Atlasez 공지",
  },

  // --- ナビゲーション ---
  メインナビゲーション: {
    en: "Main navigation",
    zh: "主导航",
    ko: "메인 내비게이션",
  },
  フッターナビゲーション: {
    en: "Footer navigation",
    zh: "页脚导航",
    ko: "푸터 내비게이션",
  },
  メニュー: { en: "Menu", zh: "菜单", ko: "메뉴" },
  分野: { en: "Subjects", zh: "领域", ko: "분야" },
  学習地図: { en: "Learning Map", zh: "学习地图", ko: "학습 지도" },
  概要: { en: "Overview", zh: "概述", ko: "개요" },
  学習リスト: { en: "Learning list", zh: "学习清单", ko: "학습 목록" },
  あとで読む: { en: "Reading list", zh: "稍后阅读", ko: "나중에 읽기" },
  学習の記録: {
    en: "Learning record",
    zh: "学习记录",
    ko: "학습 기록",
  },
  はじめての方へ: {
    en: "For beginners",
    zh: "新手指南",
    ko: "처음 오신 분께",
  },
  Atlasezとは: { en: "About Atlasez", zh: "关于 Atlasez", ko: "Atlasez 소개" },
  プロジェクト: { en: "Projects", zh: "项目", ko: "프로젝트" },
  お知らせ: { en: "News", zh: "公告", ko: "공지" },
  運営募集: { en: "Join us", zh: "招募运营", ko: "운영진 모집" },
  お問い合わせ: { en: "Contact", zh: "联系我们", ko: "문의" },

  // --- 検索 ---
  検索: { en: "Search", zh: "搜索", ko: "검색" },
  サイト内検索: { en: "Search this site", zh: "站内搜索", ko: "사이트 검색" },
  "記事名・キーワードで検索": {
    en: "Search by title or keyword",
    zh: "按标题或关键词搜索",
    ko: "제목이나 키워드로 검색",
  },

  // --- 表示設定 ---
  表示設定: { en: "Display settings", zh: "显示设置", ko: "화면 설정" },
  ダーク表示: { en: "Dark mode", zh: "深色显示", ko: "다크 모드" },
  ライト表示: { en: "Light mode", zh: "浅色显示", ko: "라이트 모드" },
  ダークモードに切り替える: {
    en: "Switch to dark mode",
    zh: "切换到深色模式",
    ko: "다크 모드로 전환",
  },
  ライトモードに切り替える: {
    en: "Switch to light mode",
    zh: "切换到浅色模式",
    ko: "라이트 모드로 전환",
  },
  言語: { en: "Language", zh: "语言", ko: "언어" },
  文字サイズ: { en: "Text size", zh: "字号", ko: "글자 크기" },
  標準: { en: "Default", zh: "标准", ko: "기본" },
  大: { en: "Large", zh: "大", ko: "크게" },
  特大: { en: "Extra large", zh: "特大", ko: "아주 크게" },
  コントラスト: { en: "Contrast", zh: "对比度", ko: "대비" },
  高: { en: "High", zh: "高", ko: "높게" },
  背景: { en: "Background", zh: "背景", ko: "배경" },
  白: { en: "White", zh: "白色", ko: "흰색" },
  低刺激色: { en: "Soft", zh: "柔和色", ko: "저자극 색" },
  暗色: { en: "Dark", zh: "深色", ko: "어두운색" },
  行間: { en: "Line spacing", zh: "行距", ko: "줄 간격" },
  広い: { en: "Wide", zh: "宽", ko: "넓게" },
  アニメーション: { en: "Animation", zh: "动画", ko: "애니메이션" },
  軽減: { en: "Reduced", zh: "减弱", ko: "줄이기" },
  フォント: { en: "Font", zh: "字体", ko: "글꼴" },
  標準ゴシック: { en: "Default sans", zh: "标准黑体", ko: "기본 고딕" },
  可読性重視: {
    en: "Readability first",
    zh: "偏重易读性",
    ko: "가독성 우선",
  },
  初期設定に戻す: { en: "Reset", zh: "恢复默认", ko: "기본값으로" },
  閉じる: { en: "Close", zh: "关闭", ko: "닫기" },

  // --- 総合ホーム ---
  タイル表示: { en: "Tiles", zh: "磁贴视图", ko: "타일 보기" },
  リスト表示: { en: "List", zh: "列表视图", ko: "목록 보기" },
  スクロールして続きを表示: {
    en: "Scroll for more",
    zh: "滚动查看更多",
    ko: "스크롤하여 더 보기",
  },
  表示切替: { en: "Switch view", zh: "切换显示", ko: "보기 전환" },
  近日公開予定の記事: {
    en: "Coming soon",
    zh: "即将公开的文章",
    ko: "곧 공개될 문서",
  },
  最近更新された記事: {
    en: "Recently updated",
    zh: "最近更新的文章",
    ko: "최근 업데이트된 문서",
  },

  // --- 記事ページ ---
  目次: { en: "Contents", zh: "目录", ko: "목차" },
  記事情報: { en: "Article info", zh: "文章信息", ko: "문서 정보" },
  "最終更新:": { en: "Last updated:", zh: "最后更新:", ko: "마지막 수정:" },
  この記事で扱う概念: {
    en: "Concepts covered",
    zh: "本文涉及的概念",
    ko: "이 문서에서 다루는 개념",
  },
  前提記事: {
    en: "Prerequisite articles",
    zh: "前置文章",
    ko: "선행 문서",
  },
  関連記事: { en: "Related articles", zh: "相关文章", ko: "관련 문서" },
  次に読む: { en: "Read next", zh: "接下来阅读", ko: "다음에 읽기" },
  記事を読む: { en: "Read article", zh: "阅读文章", ko: "문서 읽기" },
  参考文献: { en: "References", zh: "参考文献", ko: "참고 문헌" },
  この記事の問題を報告: {
    en: "Report an issue",
    zh: "报告本文的问题",
    ko: "이 문서의 문제 신고",
  },
  GitHubで編集履歴を見る: {
    en: "View history on GitHub",
    zh: "在 GitHub 查看编辑历史",
    ko: "GitHub에서 편집 이력 보기",
  },
  "↑ 目次へ戻る": {
    en: "↑ Back to contents",
    zh: "↑ 返回目录",
    ko: "↑ 목차로 돌아가기",
  },
  読んだ: { en: "Read", zh: "已读", ko: "읽음" },
  理解した: { en: "Understood", zh: "已理解", ko: "이해함" },
  保存済み: { en: "Saved", zh: "已保存", ko: "저장됨" },
  "事前演習（準備中）": {
    en: "Pre-exercise (coming soon)",
    zh: "课前练习（准备中）",
    ko: "사전 연습 (준비 중)",
  },
  "事後演習（準備中）": {
    en: "Post-exercise (coming soon)",
    zh: "课后练习（准备中）",
    ko: "사후 연습 (준비 중)",
  },
  演習は準備中です: {
    en: "Exercises coming soon",
    zh: "练习准备中",
    ko: "연습 문제 준비 중",
  },
  "この記事には参考文献がまだ登録されていません。内容を検証する際は、記事下部の報告リンクをご利用ください。":
    {
      en: "No references have been registered for this article yet. Use the report link at the bottom of the page if you want to verify the content.",
      zh: "本文尚未登记参考文献。如需核实内容，请使用页面底部的报告链接。",
      ko: "이 문서에는 아직 참고 문헌이 등록되지 않았습니다. 내용을 검증하려면 문서 하단의 신고 링크를 이용해 주세요.",
    },

  // --- 一覧・状態 ---
  準備中: { en: "In preparation", zh: "准备中", ko: "준비 중" },
  執筆中: { en: "In progress", zh: "撰写中", ko: "집필 중" },
  未着手: { en: "Not started", zh: "未开始", ko: "미착수" },
  "前提知識:": {
    en: "Prerequisites:",
    zh: "前置知识:",
    ko: "선행 지식:",
  },
  グリッド: { en: "Grid", zh: "网格", ko: "그리드" },
  // --- 一覧の補足 ---
  "目次に予定されている、本文準備中の記事です。": {
    en: "This article is planned in the contents; the text is still being prepared.",
    zh: "本文已列入目录，正文准备中。",
    ko: "목차에 예정된 문서로, 본문은 준비 중입니다.",
  },
  // 言語名はどの言語でも自国語表記のまま出す（切り替え先が分かるように）
  日本語: { en: "日本語", zh: "日本語", ko: "日本語" },
  中文: { en: "中文", zh: "中文", ko: "中文" },
  한국어: { en: "한국어", zh: "한국어", ko: "한국어" },

  リスト: { en: "List", zh: "列表", ko: "목록" },
};
