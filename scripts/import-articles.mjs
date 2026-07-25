#!/usr/bin/env node
/** 数学・化学の抽出JSONをMarkdownと概念定義へ変換する。再実行可能。 */
import {
  appendConcepts,
  cleanBody,
  readJson,
  writeArticle,
} from "./import-utils.mjs";

const input = process.argv[2];
if (!input) {
  console.error(
    "使い方: node scripts/import-articles.mjs <atlas-articles.json>",
  );
  process.exit(1);
}

const MATH = [
  ["集合", "set-theory", "sets", []],
  ["集合の演算", "set-theory", "set-operations", ["math.set-theory.sets"]],
  ["関係", "set-theory", "relations", ["math.set-theory.set-operations"]],
  ["写像", "set-theory", "mappings", ["math.set-theory.set-operations"]],
  ["順序関係", "set-theory", "order-relations", ["math.set-theory.relations"]],
  ["上方集合", "set-theory", "upper-sets", ["math.set-theory.order-relations"]],
  ["上界集合", "set-theory", "upper-bounds", ["math.set-theory.upper-sets"]],
  [
    "有向性",
    "set-theory",
    "directed-sets",
    ["math.set-theory.order-relations"],
  ],
  [
    "群の定義",
    "group-theory",
    "group-definition",
    ["math.set-theory.mappings"],
  ],
  [
    "群の例",
    "group-theory",
    "group-examples",
    ["math.group-theory.group-definition"],
  ],
  [
    "対称群の定義",
    "group-theory",
    "symmetric-groups",
    ["math.group-theory.group-definition"],
  ],
  [
    "部分群の定義",
    "group-theory",
    "subgroups",
    ["math.group-theory.group-definition"],
  ],
  [
    "部分群の例",
    "group-theory",
    "subgroup-examples",
    ["math.group-theory.subgroups"],
  ],
  [
    "群の生成系",
    "group-theory",
    "generating-sets",
    ["math.group-theory.subgroups"],
  ],
  [
    "巡回群",
    "group-theory",
    "cyclic-groups",
    ["math.group-theory.generating-sets"],
  ],
  [
    "準同型写像の定義",
    "group-theory",
    "homomorphisms",
    ["math.group-theory.subgroups"],
  ],
  [
    "準同型写像の像と核",
    "group-theory",
    "homomorphism-image-kernel",
    ["math.group-theory.homomorphisms"],
  ],
  [
    "準同型定理",
    "group-theory",
    "homomorphism-theorem",
    ["math.group-theory.homomorphism-image-kernel"],
  ],
  [
    "群の作用と置換表現の定義",
    "group-theory",
    "group-actions",
    ["math.group-theory.group-definition", "math.set-theory.mappings"],
  ],
  [
    "群の作用の性質と例",
    "group-theory",
    "group-action-properties",
    ["math.group-theory.group-actions"],
  ],
  [
    "共役作用",
    "group-theory",
    "conjugation-actions",
    ["math.group-theory.group-action-properties"],
  ],
  [
    "群の線形表現",
    "group-theory",
    "linear-representations",
    ["math.group-theory.group-actions", "math.module-theory.modules"],
  ],
  [
    "Schurの補題",
    "group-theory",
    "schur-lemma",
    ["math.group-theory.linear-representations"],
  ],
  [
    "自己同型群",
    "group-theory",
    "automorphism-groups",
    ["math.group-theory.homomorphisms"],
  ],
  [
    "正規部分群と特性部分群",
    "group-theory",
    "normal-characteristic-subgroups",
    ["math.group-theory.conjugation-actions", "math.group-theory.subgroups"],
  ],
  [
    "剰余群の定義と部分群の対応",
    "group-theory",
    "quotient-groups",
    [
      "math.group-theory.normal-characteristic-subgroups",
      "math.set-theory.equivalence-relations",
    ],
  ],
  [
    "環の定義",
    "ring-theory",
    "ring-definition",
    ["math.group-theory.group-definition"],
  ],
  [
    "部分環の定義",
    "ring-theory",
    "subrings",
    ["math.ring-theory.ring-definition"],
  ],
  [
    "部分環の例",
    "ring-theory",
    "subring-examples",
    ["math.ring-theory.subrings"],
  ],
  [
    "環準同型写像の定義",
    "ring-theory",
    "ring-homomorphisms",
    ["math.ring-theory.subrings", "math.group-theory.homomorphisms"],
  ],
  ["単元の定義", "ring-theory", "units", ["math.ring-theory.ring-definition"]],
  [
    "単元群の定義",
    "ring-theory",
    "unit-groups",
    ["math.ring-theory.units", "math.group-theory.group-definition"],
  ],
  [
    "環上の加群の定義",
    "module-theory",
    "modules",
    ["math.ring-theory.ring-definition", "math.group-theory.group-definition"],
  ],
  [
    "環上の加群の例",
    "module-theory",
    "module-examples",
    ["math.module-theory.modules"],
  ],
  [
    "加群の準同型写像",
    "module-theory",
    "module-homomorphisms",
    ["math.module-theory.modules", "math.group-theory.homomorphisms"],
  ],
];

const CHEM = [
  ["物質の構成", "matter", "composition-of-matter", []],
  [
    "物質の相",
    "matter",
    "phases-of-matter",
    ["chem.matter.composition-of-matter"],
  ],
  [
    "混合物の分離と精製",
    "matter",
    "separation-purification",
    ["chem.matter.phases-of-matter"],
  ],
  [
    "原子の構造",
    "atomic-structure",
    "atomic-structure",
    ["chem.matter.composition-of-matter"],
  ],
  [
    "電子配置",
    "atomic-structure",
    "electron-configuration",
    ["chem.atomic-structure.atomic-structure"],
  ],
  [
    "周期表",
    "atomic-structure",
    "periodic-table",
    ["chem.atomic-structure.electron-configuration"],
  ],
  [
    "イオン",
    "atomic-structure",
    "ions",
    ["chem.atomic-structure.electron-configuration"],
  ],
  [
    "イオン化エネルギー・電子親和力",
    "atomic-structure",
    "ionization-energy-electron-affinity",
    ["chem.atomic-structure.periodic-table"],
  ],
  [
    "化学結合・分子間相互作用",
    "chemical-bonding",
    "chemical-bonds-intermolecular-forces",
    ["chem.atomic-structure.ions"],
  ],
  [
    "電気陰性度",
    "chemical-bonding",
    "electronegativity",
    [
      "chem.chemical-bonding.chemical-bonds-intermolecular-forces",
      "chem.atomic-structure.periodic-table",
    ],
  ],
  [
    "化学反応式",
    "chemical-reactions",
    "chemical-equations",
    ["chem.chemical-bonding.chemical-bonds-intermolecular-forces"],
  ],
  [
    "物質量・モル(mol)",
    "chemical-reactions",
    "amount-of-substance",
    ["chem.atomic-structure.atomic-structure"],
  ],
  [
    "物質の状態変化",
    "matter",
    "phase-transitions",
    ["chem.matter.phases-of-matter"],
  ],
  ["溶解と溶液", "matter", "solutions", ["chem.matter.composition-of-matter"]],
  [
    "コロイド分散系",
    "matter",
    "colloidal-dispersions",
    ["chem.matter.solutions"],
  ],
  [
    "コロイド溶液",
    "matter",
    "colloidal-solutions",
    ["chem.matter.colloidal-dispersions"],
  ],
  [
    "酸塩基反応の定義",
    "chemical-reactions",
    "acid-base-reactions",
    ["chem.chemical-reactions.chemical-equations", "chem.matter.solutions"],
  ],
];

const data = readJson(input);
const maps = new Map([
  [
    "atlas-mathematics",
    {
      subject: "mathematics",
      prefix: "math",
      author: "atlas-math-team",
      rows: MATH,
      difficulty: "intermediate",
    },
  ],
  [
    "atlas-chemistry",
    {
      subject: "chemistry",
      prefix: "chem",
      author: "atlas-chem-team",
      rows: CHEM,
      difficulty: "basic",
    },
  ],
]);

let articles = 0;
const concepts = [];
const pageKey = (value) =>
  value.toLocaleLowerCase("ja").replace(/[・/（）()\s-]/gu, "");
for (const [site, config] of maps) {
  const source = data.articles.filter(
    (article) => article.site === site && article.text,
  );
  const byPage = new Map(
    source.map((article) => [pageKey(article.page), article]),
  );
  for (const [title, category, slug, prerequisites] of config.rows) {
    const raw = byPage.get(pageKey(title));
    if (!raw) throw new Error(`${site}: 抽出データに「${title}」がありません`);
    const conceptId = `${config.prefix}.${category}.${slug}`;
    const body = cleanBody(raw.text, title);
    writeArticle({
      subject: config.subject,
      category,
      slug,
      title,
      conceptId,
      author: config.author,
      body,
      difficulty: config.difficulty,
    });
    concepts.push({
      id: conceptId,
      subject: config.subject,
      category,
      name: { ja: title },
      prerequisites,
      recommendedNext: [],
      related: [],
      alternatives: [],
    });
    articles++;
  }
}

const added = appendConcepts(concepts, "Google Sites移植: 数学・化学");
console.log(
  `数学・化学の記事${articles}件を書き出し、概念${added}件を追加しました。`,
);
