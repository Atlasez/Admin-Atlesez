/**
 * 概念グラフに分野をまたぐ関連（related）を追加する。
 *
 *   node scripts/add-cross-subject-links.mjs --dry   … 追加内容を表示するだけ
 *   node scripts/add-cross-subject-links.mjs         … 書き換える
 *
 * これまで concepts.yaml の辺はすべて同じ分野の中で閉じており、
 * 学習地図が分野ごとにばらばらの島になっていた。「前提となる知識と
 * 結びつけて学ぶ」というサイトの趣旨からは、分野をまたぐ線こそ要になる。
 *
 * related は無向として扱われるが、記事ページの「関連記事」は自分の概念の
 * related しか見ないため、両側に書き込む。
 *
 * 何度実行してもよい（すでにある関連は足さない）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { ROOT } from "./import-utils.mjs";

const CONCEPTS_FILE = join(ROOT, "src/content/concepts/concepts.yaml");
const dryRun = process.argv.includes("--dry");

/** [概念A, 概念B, つながりの根拠] */
const CROSS_SUBJECT_LINKS = [
  [
    "physics.newtonian-mechanics.space-time-coordinate-systems",
    "math.linear-algebra.vector-space",
    "座標系は線形空間として定式化される",
  ],
  [
    "physics.newtonian-mechanics.coordinate-transformations",
    "math.linear-algebra.linear-map",
    "座標変換は線形写像そのもの",
  ],
  [
    "chem.chemical-reactions.amount-of-substance",
    "physics.foundations.physical-quantities",
    "物質量はSI基本量のひとつ",
  ],
  [
    "chem.chemical-bonding.chemical-bonds-intermolecular-forces",
    "physics.newtonian-mechanics.kinetic-energy-work",
    "結合エネルギーは仕事とエネルギーの考え方に基づく",
  ],
  [
    "biology.biochemistry.fatty-acids-lipids",
    "chem.chemical-bonding.chemical-bonds-intermolecular-forces",
    "脂質二重層は分子間相互作用で保たれる",
  ],
  [
    "biology.biochemistry.fatty-acids-lipids",
    "chem.matter.solutions",
    "親水性・疎水性は溶解の理解が前提",
  ],
  [
    "astronomy.stellar-astronomy.stars",
    "chem.atomic-structure.atomic-structure",
    "恒星のスペクトルから元素を読み取る",
  ],
  [
    "astronomy.stellar-astronomy.stars",
    "physics.newtonian-mechanics.space-time-coordinate-systems",
    "日周運動の記述には天球座標が要る",
  ],
  // 同じ分野の中で孤立していた組
  [
    "biology.plant-physiology.auxin-functions",
    "biology.cell-biology.cell-division",
    "オーキシンは細胞の伸長と分裂を促す",
  ],
];

const doc = parseDocument(readFileSync(CONCEPTS_FILE, "utf8"));
const items = doc.contents.items;

/** id から YAML のマップノードを引く */
const byId = new Map();
for (const item of items) {
  const id = item.get("id");
  if (id) byId.set(id, item);
}

const missing = [];
let added = 0;

function addRelated(fromId, toId) {
  const node = byId.get(fromId);
  if (!node) {
    missing.push(fromId);
    return;
  }
  let related = node.get("related");
  if (!related) {
    node.set("related", doc.createNode([toId]));
    added += 1;
    return;
  }
  const current = related.toJSON();
  if (current.includes(toId)) return;
  related.add(doc.createNode(toId));
  added += 1;
}

for (const [a, b, reason] of CROSS_SUBJECT_LINKS) {
  if (dryRun) console.log(`${a}\n  ⇄ ${b}\n  （${reason}）\n`);
  addRelated(a, b);
  addRelated(b, a);
}

if (missing.length > 0) {
  console.error("存在しない概念ID:", [...new Set(missing)].join(", "));
  process.exit(1);
}

console.log(`関連 ${CROSS_SUBJECT_LINKS.length}組 / 書き込んだ参照 ${added}件`);

if (dryRun) {
  console.log("--dry のため書き込みはしていません。");
} else {
  writeFileSync(CONCEPTS_FILE, doc.toString({ lineWidth: 0 }), "utf8");
}
