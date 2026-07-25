/**
 * 漢字分野の概念グラフを組み直す。
 *
 *   node scripts/restructure-kanji-graph.mjs --dry   … 変更内容を表示するだけ
 *   node scripts/restructure-kanji-graph.mjs         … 書き換える
 *
 * インポータは旧サイトの目次順をそのまま `recommendedNext` に落としており、
 * 漢字 78 概念がカテゴリごとに一本道の鎖（最大 40 ノード）になっていた。
 * これは「次に学ぶとよい項目」ではなく単なる掲載順で、学習地図に描くと
 * 意味のない長い列ができるだけだった。
 *
 * ここでは
 *
 *   1. 漢字概念の `recommendedNext` をすべて外す（擬似的な学習順の解体）
 *   2. カテゴリをまたぐ「意味の近さ」だけを `related` として残す
 *      （同じカテゴリ内のつながりは、地図側のカテゴリ枠で表現する）
 *
 * 何度実行してもよい。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { ROOT } from "./import-utils.mjs";

const CONCEPTS_FILE = join(ROOT, "src/content/concepts/concepts.yaml");
const dryRun = process.argv.includes("--dry");

/**
 * カテゴリをまたぐ意味的なつながり。[概念A, 概念B, 根拠]
 * 同カテゴリ内の組は地図のカテゴリ枠で足りるので入れない。
 */
const KANJI_LINKS = [
  ["kanji.nature.waterside", "kanji.society.flood-control", "水辺と治水"],
  ["kanji.nature.waterside", "kanji.daily-life.ships", "水辺と船"],
  [
    "kanji.daily-life.medicine-poison",
    "kanji.human-body.injuries-illness",
    "薬・毒と傷・病",
  ],
  ["kanji.daily-life.agriculture", "kanji.daily-life.grains", "農業と穀物"],
  [
    "kanji.daily-life.agriculture",
    "kanji.daily-life.cattle-horses",
    "農耕と牛馬",
  ],
  ["kanji.vocabulary.cooking", "kanji.daily-life.beverages", "調理と飲み物"],
  ["kanji.vocabulary.cooking", "kanji.daily-life.grains", "調理と穀物"],
  [
    "kanji.vocabulary.cities-villages",
    "kanji.society.relationships-family",
    "都市・村落と人間関係",
  ],
  ["kanji.vocabulary.emotions", "kanji.human-body.mind-heart", "感情と心"],
  ["kanji.vocabulary.colors", "kanji.vocabulary.patterns", "色と模様"],
  ["kanji.culture.gems-jewels", "kanji.daily-life.metals", "宝玉と金属"],
  [
    "kanji.daily-life.weapons-armor",
    "kanji.society.crime-punishment",
    "武器・武具と罪刑",
  ],
  ["kanji.nature.weather", "kanji.nature.sky", "気象と空"],
  ["kanji.vocabulary.time", "kanji.nature.sun-moon-stars", "時間と天体の運行"],
];

const doc = parseDocument(readFileSync(CONCEPTS_FILE, "utf8"));
const items = doc.contents.items;

const byId = new Map();
for (const item of items) {
  const id = item.get("id");
  if (id) byId.set(id, item);
}

// 1. 漢字の擬似的な学習順を外す
let clearedChains = 0;
for (const item of items) {
  if (item.get("subject") !== "kanji") continue;
  const next = item.get("recommendedNext");
  if (!next) continue;
  const count = next.toJSON()?.length ?? 0;
  if (count === 0) continue;
  item.set("recommendedNext", doc.createNode([]));
  clearedChains += count;
}

// 2. 意味の近いものだけ related でつなぐ（related は両側に書く）
const missing = [];
let addedLinks = 0;

function addRelated(fromId, toId) {
  const node = byId.get(fromId);
  if (!node) {
    missing.push(fromId);
    return;
  }
  const related = node.get("related");
  if (!related) {
    node.set("related", doc.createNode([toId]));
    addedLinks += 1;
    return;
  }
  if (related.toJSON().includes(toId)) return;
  related.add(doc.createNode(toId));
  addedLinks += 1;
}

for (const [a, b, reason] of KANJI_LINKS) {
  if (dryRun) console.log(`${a}\n  ⇄ ${b}  （${reason}）`);
  addRelated(a, b);
  addRelated(b, a);
}

if (missing.length > 0) {
  console.error("存在しない概念ID:", [...new Set(missing)].join(", "));
  process.exit(1);
}

console.log(
  `\n解体した擬似学習順 ${clearedChains} 本 / ` +
    `追加した意味的なつながり ${KANJI_LINKS.length} 組（参照 ${addedLinks} 件）`,
);

if (dryRun) {
  console.log("--dry のため書き込みはしていません。");
} else {
  writeFileSync(CONCEPTS_FILE, doc.toString({ lineWidth: 0 }), "utf8");
}
