/**
 * 管理Workerが静的な subjects.yaml のカテゴリを初期カタログへ取り込むための
 * 最小限の表示情報。公開用の詳細（入口概念や関連カテゴリ）はGitHub上の
 * subjects.yamlを正本とし、ここでは管理画面で並び替える対象だけを定義する。
 */
export const EDITORIAL_STATIC_CATEGORIES: Record<
  string,
  Array<{ slug: string; name: string; sortOrder: number }>
> = {
  kanji: [
    ["overview", "概要"],
    ["supernatural-religion", "超自然・宗教"],
    ["nature", "自然"],
    ["society", "社会"],
    ["daily-life", "生活"],
    ["culture", "文化"],
    ["human-body", "人間・人体"],
    ["vocabulary", "意味別語彙"],
  ].map(([slug, name], sortOrder) => ({ slug, name, sortOrder })),
  kobun: [
    ["overview", "概要"],
    ["classical-literature", "古典作品"],
  ].map(([slug, name], sortOrder) => ({ slug, name, sortOrder })),
  mathematics: [
    ["overview", "概要"],
    ["set-theory", "集合論"],
    ["group-theory", "群論"],
    ["linear-algebra", "線形代数"],
    ["ring-theory", "環論"],
    ["module-theory", "加群論"],
  ].map(([slug, name], sortOrder) => ({ slug, name, sortOrder })),
  physics: [
    ["overview", "概要"],
    ["foundations", "物理の基礎"],
    ["newtonian-mechanics", "ニュートン力学"],
    ["oscillations", "振動"],
    ["continuum-mechanics", "拘束系・連続体力学"],
    ["relativity", "相対性理論"],
    ["electromagnetism", "電磁気学"],
    ["thermodynamics", "熱力学・統計力学"],
    ["quantum-mechanics", "量子力学"],
    ["analytical-mechanics", "解析力学"],
  ].map(([slug, name], sortOrder) => ({ slug, name, sortOrder })),
  chemistry: [
    ["overview", "概要"],
    ["matter", "物質の構成と状態"],
    ["atomic-structure", "原子の構造と周期表"],
    ["chemical-bonding", "化学結合"],
    ["chemical-reactions", "化学反応"],
  ].map(([slug, name], sortOrder) => ({ slug, name, sortOrder })),
  astronomy: [
    ["overview", "概要"],
    ["stellar-astronomy", "恒星"],
  ].map(([slug, name], sortOrder) => ({ slug, name, sortOrder })),
  biology: [
    ["overview", "概要"],
    ["biochemistry", "生化学"],
    ["cell-biology", "細胞生物学"],
    ["plant-physiology", "植物生理学"],
  ].map(([slug, name], sortOrder) => ({ slug, name, sortOrder })),
};
