export const recruitmentLabels = {
  open: "募集中",
  paused: "募集停止",
  closed: "募集終了",
} as const;

export const phaseLabels = {
  planned: "未実施",
  active: "実施中",
  paused: "一時休止",
  ended: "終了",
  unknown: "実施状況未掲載",
} as const;

export const seminarFields = [
  { key: "theme", label: "テーマ", limit: 120 },
  { key: "level", label: "対象レベル", limit: 200 },
  { key: "purpose", label: "目的", limit: 2000 },
  { key: "description", label: "内容", limit: 4000 },
  { key: "goals", label: "到達目標", limit: 2000 },
  { key: "method", label: "進め方", limit: 2000 },
  { key: "materials", label: "教材", limit: 2000 },
  { key: "prerequisites", label: "前提知識", limit: 1000 },
  { key: "conditions", label: "参加条件・募集範囲", limit: 1000 },
  { key: "observation", label: "見学の可否", limit: 200 },
  { key: "lateJoin", label: "途中参加の可否", limit: 200 },
  { key: "schedule", label: "開催日時", limit: 300 },
  { key: "period", label: "開催期間", limit: 200 },
  { key: "frequency", label: "開催頻度", limit: 200 },
  { key: "format", label: "開催形式", limit: 200 },
  { key: "venue", label: "開催場所", limit: 300 },
  { key: "currentSize", label: "現在の人数", limit: 100 },
  { key: "capacity", label: "定員", limit: 100 },
  { key: "organizer", label: "主催者（公開名）", limit: 160 },
  { key: "remarks", label: "備考", limit: 1000, optional: true },
] as const;

export const profileFields = [
  { key: "name", label: "氏名", limit: 120, required: true },
  { key: "reading", label: "氏名の読み（ひらがな）", limit: 120 },
  { key: "registration", label: "旧サイトで発行された参加番号", limit: 50 },
  { key: "birthday", label: "生年月日（任意）", limit: 10 },
  { key: "residenceCountry", label: "居住地（国・任意）", limit: 100 },
  {
    key: "residencePrefecture",
    label: "居住地（都道府県・任意）",
    limit: 60,
  },
  { key: "residenceCity", label: "居住地（都市名・任意）", limit: 120 },
  {
    key: "affiliationType",
    label: "所属区分（大学・高校・社会人など）",
    limit: 120,
  },
  { key: "affiliation", label: "所属先・学部など", limit: 200 },
  { key: "clubs", label: "参加しているサークル・団体", limit: 200 },
  { key: "discovery", label: "このサイトを知ったきっかけ", limit: 200 },
] as const;

export const seminarNumber = (number: number) =>
  String(number).padStart(7, "0");

export const maxSeminarFileBytes = 1_000_000;
