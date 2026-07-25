#!/usr/bin/env node
/**
 * コンテンツ検証スクリプト（CIで実行）。
 * - 概念: 重複ID / 存在しない参照 / prerequisite循環
 * - 記事: articleId重複 / ロケール内slug重複 / 存在しない概念参照 / 必須フィールド
 * - 準備中記事: 存在しない分野・カテゴリ / 重複 / 公開済み記事との題名衝突
 * 失敗時は終了コード1。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

// ---------- 概念 ----------
const concepts = parseYaml(
  readFileSync(join(root, "src/content/concepts/concepts.yaml"), "utf8"),
);
const conceptIds = new Set();
for (const c of concepts) {
  if (conceptIds.has(c.id)) errors.push(`概念IDが重複: ${c.id}`);
  conceptIds.add(c.id);
}
for (const c of concepts) {
  const refs = [
    ...(c.prerequisites ?? []),
    ...(c.recommendedNext ?? []),
    ...(c.related ?? []),
    ...(c.alternatives ?? []),
    ...(c.partOf ? [c.partOf] : []),
  ];
  for (const r of refs) {
    if (!conceptIds.has(r)) {
      errors.push(`概念 ${c.id} が存在しない概念 ${r} を参照`);
    }
  }
}

// prerequisite循環（DFS）
{
  const prereq = new Map(concepts.map((c) => [c.id, c.prerequisites ?? []]));
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map();
  const stack = [];
  const visit = (id) => {
    color.set(id, GRAY);
    stack.push(id);
    for (const p of prereq.get(id) ?? []) {
      if (!prereq.has(p)) continue;
      const st = color.get(p) ?? WHITE;
      if (st === GRAY) {
        errors.push(
          `prerequisite循環: ${[...stack.slice(stack.indexOf(p)), p].join(" → ")}`,
        );
      } else if (st === WHITE) {
        visit(p);
      }
    }
    stack.pop();
    color.set(id, BLACK);
  };
  for (const id of prereq.keys()) {
    if ((color.get(id) ?? WHITE) === WHITE) visit(id);
  }
}

// ---------- 記事 ----------
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

const articleFiles = walk(join(root, "src/content/articles"));
const articleIds = new Set();
const slugKeys = new Set();
const articleTitleKeys = new Set();
const REQUIRED = [
  "articleId",
  "locale",
  "title",
  "slug",
  "subject",
  "category",
  "concepts",
  "authors",
  "status",
  "createdAt",
  "updatedAt",
  "summary",
  "difficulty",
  "estimatedMinutes",
];

for (const file of articleFiles) {
  const text = readFileSync(file, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) {
    errors.push(`frontmatterがありません: ${file}`);
    continue;
  }
  let fm;
  try {
    fm = parseYaml(m[1]);
  } catch (e) {
    errors.push(`frontmatterのYAMLが不正: ${file}: ${e.message}`);
    continue;
  }
  for (const key of REQUIRED) {
    if (fm[key] === undefined)
      errors.push(`${file}: 必須フィールド ${key} がありません`);
  }
  if (fm.articleId) {
    if (articleIds.has(fm.articleId))
      errors.push(`articleIdが重複: ${fm.articleId}`);
    articleIds.add(fm.articleId);
  }
  const slugKey = `${fm.locale}/${fm.subject}/${fm.category}/${fm.slug}`;
  if (slugKeys.has(slugKey)) errors.push(`slugが重複: ${slugKey}`);
  slugKeys.add(slugKey);
  articleTitleKeys.add(`${fm.locale}/${fm.subject}/${fm.category}/${fm.title}`);
  for (const c of fm.concepts ?? []) {
    if (!conceptIds.has(c.id))
      errors.push(`${file}: 存在しない概念 ${c.id} を参照`);
  }
  for (const p of [...(fm.prerequisites ?? []), ...(fm.related ?? [])]) {
    if (!conceptIds.has(p)) errors.push(`${file}: 存在しない概念 ${p} を参照`);
  }
}

// ---------- 本文準備中の記事 ----------
const subjects = parseYaml(
  readFileSync(join(root, "src/content/subjects/subjects.yaml"), "utf8"),
);
const categoryKeys = new Set(
  subjects.flatMap((subject) =>
    (subject.categories ?? []).map(
      (category) => `${subject.slug}/${category.slug}`,
    ),
  ),
);
const planned = JSON.parse(
  readFileSync(join(root, "src/data/planned-articles.json"), "utf8"),
).items;
const plannedKeys = new Set();
for (const item of planned) {
  const categoryKey = `${item.subject}/${item.category}`;
  if (!categoryKeys.has(categoryKey)) {
    errors.push(`準備中記事が存在しない分野・カテゴリを参照: ${categoryKey}`);
  }
  const plannedKey = `${categoryKey}/${item.title.ja}`;
  if (plannedKeys.has(plannedKey)) {
    errors.push(`準備中記事が重複: ${plannedKey}`);
  }
  plannedKeys.add(plannedKey);
  if (articleTitleKeys.has(`ja/${plannedKey}`)) {
    errors.push(`準備中記事が公開済み記事と重複: ${plannedKey}`);
  }
}

// ---------- 結果 ----------
if (errors.length > 0) {
  console.error(`コンテンツ検証エラー: ${errors.length}件`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(
  `コンテンツ検証OK: 概念${conceptIds.size}件・記事${articleFiles.length}件・準備中${planned.length}件`,
);
