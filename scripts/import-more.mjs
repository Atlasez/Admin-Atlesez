#!/usr/bin/env node
/** 追加分野の `{sites:[{site,pages:[{page,text}]}]}` JSON を移植する。再実行可能。 */
import {
  appendConcepts,
  cleanBody,
  readJson,
  writeArticle,
} from "./import-utils.mjs";

const input = process.argv[2];
if (!input) {
  console.error("使い方: node scripts/import-more.mjs <atlas-articles-2.json>");
  process.exit(1);
}

const KANJI_SLUGS = {
  1: "sky",
  2: "weather",
  3: "mythical-creatures",
  4: "buddhism",
  5: "sun-moon-stars",
  6: "temperature",
  7: "waterside",
  8: "terrain",
  9: "rocks-sand",
  10: "trees",
  11: "directions",
  12: "relationships-family",
  13: "flags-banners",
  14: "crime-punishment",
  15: "flood-control",
  16: "fire-light",
  17: "metals",
  18: "numbers-units",
  19: "medicine-poison",
  20: "weapons-armor",
  21: "beverages",
  22: "curtains-tents",
  23: "containers",
  24: "musical-instruments",
  25: "ships",
  26: "cattle-horses",
  27: "gems-jewels",
  28: "grains",
  29: "agriculture",
  30: "body-torso",
  31: "hair",
  32: "face",
  33: "head-neck",
  34: "mind-heart",
  35: "skin-muscles-bones-organs",
  36: "roads",
  37: "colors",
  38: "injuries-illness",
  39: "shoulders-arms",
  40: "legs-feet",
  41: "hands",
  42: "patterns",
  43: "emotions",
  44: "smells",
  45: "time",
  46: "selection",
  47: "forgiveness",
  48: "cooking",
  49: "sincerity",
  50: "self-indulgence",
  51: "taste",
  52: "spreading-widely",
  53: "poverty-low-status",
  54: "rebuking",
  55: "reaching",
  56: "greed",
  57: "retreating",
  58: "restraint",
  59: "kinds",
  60: "criticism",
  61: "flattery",
  62: "analogy",
  63: "looking-peeking",
  64: "repetition",
  65: "detail",
  66: "taboo",
  67: "confusion",
  68: "waiting-welcoming",
  69: "involvement",
  70: "suddenly",
  71: "following",
  72: "comparison",
  73: "lies-deception",
  74: "troublesome",
  75: "continuation",
  76: "obstruction",
  77: "appearance-expression",
  78: "cities-villages",
};

function kanjiCategory(page) {
  const top = page.split("/")[0];
  return (
    {
      超自然宗教: "supernatural-religion",
      自然: "nature",
      社会: "society",
      生活: "daily-life",
      文化: "culture",
      人間: "human-body",
    }[top] ?? "vocabulary"
  );
}

const PHYSICS = {
  物理量: ["foundations", "physical-quantities", []],
  ニュートン力学の原理: [
    "newtonian-mechanics",
    "principles-of-newtonian-mechanics",
    ["physics.foundations.physical-quantities"],
  ],
  空間と時間の性質座標系: [
    "newtonian-mechanics",
    "space-time-coordinate-systems",
    ["physics.foundations.physical-quantities"],
  ],
  座標系の変換: [
    "newtonian-mechanics",
    "coordinate-transformations",
    ["physics.newtonian-mechanics.space-time-coordinate-systems"],
  ],
  質点質点系: [
    "newtonian-mechanics",
    "particles-particle-systems",
    ["physics.newtonian-mechanics.principles-of-newtonian-mechanics"],
  ],
  運動エネルギーと仕事: [
    "newtonian-mechanics",
    "kinetic-energy-work",
    ["physics.newtonian-mechanics.particles-particle-systems"],
  ],
  運動量と力積: [
    "newtonian-mechanics",
    "momentum-impulse",
    ["physics.newtonian-mechanics.particles-particle-systems"],
  ],
  運動量保存則: [
    "newtonian-mechanics",
    "conservation-of-momentum",
    ["physics.newtonian-mechanics.momentum-impulse"],
  ],
  質量のあるバネ: [
    "oscillations",
    "massive-spring",
    ["physics.newtonian-mechanics.kinetic-energy-work"],
  ],
};

const BIOLOGY = {
  脂肪酸脂質: ["biochemistry", "fatty-acids-lipids", []],
  細胞小器官: ["cell-biology", "cell-organelles", []],
  細胞分裂: [
    "cell-biology",
    "cell-division",
    ["biology.cell-biology.cell-organelles"],
  ],
  オーキシンとは: ["plant-physiology", "auxin", []],
  オーキシンの働き: [
    "plant-physiology",
    "auxin-functions",
    ["biology.plant-physiology.auxin"],
  ],
};

const key = (value) => value.replace(/[・/（）()\s-]/gu, "");
const data = readJson(input);
if (!Array.isArray(data.sites)) throw new Error("sites配列がありません");

const records = [];
for (const site of data.sites) {
  for (const page of site.pages.filter((item) => item.text)) {
    if (site.site === "atlas-kanji") {
      records.push({
        subject: "kanji",
        prefix: "kanji",
        category: kanjiCategory(page.page),
        slug: KANJI_SLUGS[page.order],
        title: page.label,
        sourceTitle: page.label,
        author: "atlas-kanji-team",
        page,
        order: page.order,
        prerequisites: [],
      });
    } else if (site.site === "atlas-kobun") {
      const overview = page.page.endsWith("/トップ");
      records.push({
        subject: "kobun",
        prefix: "kobun",
        category: "classical-literature",
        slug: overview
          ? "tale-of-the-bamboo-cutter-overview"
          : "kaguyahime-childhood",
        title: page.label,
        sourceTitle: page.label,
        author: "atlas-kobun-team",
        page,
        order: overview ? 0 : 1,
        prerequisites: overview
          ? []
          : ["kobun.classical-literature.tale-of-the-bamboo-cutter-overview"],
      });
    } else if (site.site === "atlas-physics") {
      const config =
        PHYSICS[key(page.label)] ?? PHYSICS[key(page.page.split("/").at(-1))];
      if (!config)
        throw new Error(`物理のマッピングがありません: ${page.page}`);
      records.push({
        subject: "physics",
        prefix: "physics",
        category: config[0],
        slug: config[1],
        title: page.label,
        sourceTitle: page.label,
        author: "atlas-physics-team",
        page,
        order: page.order,
        prerequisites: config[2],
        difficulty: "intermediate",
      });
    } else if (site.site === "atlas-biology" && !/^การ/u.test(page.page)) {
      const config = BIOLOGY[key(page.label)] ?? BIOLOGY[key(page.page)];
      if (!config)
        throw new Error(`生物のマッピングがありません: ${page.page}`);
      records.push({
        subject: "biology",
        prefix: "biology",
        category: config[0],
        slug: config[1],
        title: page.label,
        sourceTitle: page.label,
        author: "atlas-biology-team",
        page,
        order: page.order,
        prerequisites: config[2],
      });
    } else if (site.site === "atlas-astronomy") {
      records.push({
        subject: "astronomy",
        prefix: "astronomy",
        category: "stellar-astronomy",
        slug: "stars",
        title: page.label,
        sourceTitle: page.label,
        author: "atlas-astronomy-team",
        page,
        order: page.order,
        prerequisites: [],
      });
    }
  }
}

if (records.some((record) => !record.slug)) {
  throw new Error("slugが未定義の記事があります");
}

// 漢字は意味上の前提を捏造せず、カテゴリ内を推奨順で接続する。
const recommendedNext = new Map();
for (const category of new Set(
  records.filter((r) => r.subject === "kanji").map((r) => r.category),
)) {
  const ordered = records
    .filter((r) => r.subject === "kanji" && r.category === category)
    .sort((a, b) => a.order - b.order);
  for (let i = 0; i < ordered.length - 1; i++) {
    recommendedNext.set(`kanji.${category}.${ordered[i].slug}`, [
      `kanji.${category}.${ordered[i + 1].slug}`,
    ]);
  }
}

const concepts = [];
for (const record of records) {
  const conceptId = `${record.prefix}.${record.category}.${record.slug}`;
  const body = cleanBody(record.page.text, record.sourceTitle);
  writeArticle({
    subject: record.subject,
    category: record.category,
    slug: record.slug,
    title: record.title,
    conceptId,
    author: record.author,
    body,
    difficulty: record.difficulty ?? "basic",
  });
  concepts.push({
    id: conceptId,
    subject: record.subject,
    category: record.category,
    name: { ja: record.title },
    prerequisites: record.prerequisites,
    recommendedNext: recommendedNext.get(conceptId) ?? [],
    related:
      conceptId === "biology.biochemistry.fatty-acids-lipids"
        ? ["biology.cell-biology.cell-organelles"]
        : conceptId === "astronomy.stellar-astronomy.stars"
          ? ["kanji.nature.sun-moon-stars"]
          : [],
    alternatives: [],
  });
}

const added = appendConcepts(concepts, "Google Sites移植: 追加分野");
console.log(
  `追加分野の記事${records.length}件を書き出し、概念${added}件を追加しました。`,
);
