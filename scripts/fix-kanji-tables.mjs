/**
 * 漢字記事の一字表を組み直す。
 *
 *   node scripts/fix-kanji-tables.mjs --dry   … 変換結果を表示するだけ
 *   node scripts/fix-kanji-tables.mjs         … 書き換える
 *
 * 元データは Google Sites の表で、読みのセルが縦に結合されていた。
 * Markdown 変換の際に
 *
 *   1. 先頭の行（実データ）がそのまま Markdown のヘッダ行になってしまい、
 *      1 文字目の漢字が見出しとして描画されていた
 *   2. 結合セルだった箇所が空セルや欠けた列として残り、表に穴が空いていた
 *
 * という 2 つの崩れが起きている。ここでは
 *
 *   | 火 | ひ | ほ |     ← 実データがヘッダになっていた
 *   | --- | --- | --- |
 *   | 燬 |  |            ← 「火」と同じ読み（結合セル）
 *   | 炎 | ほのお |
 *   | 焔 |               ← 「炎」と同じ読み
 *
 * を、読みを上から引き継いだ 2 列の表に直す。
 *
 *   | 漢字 | 読み   |
 *   | ---- | ------ |
 *   | 火   | ひ、ほ |
 *   | 燬   | ひ、ほ |
 *   | 炎   | ほのお |
 *   | 焔   | ほのお |
 *
 * 変換済みの表（ヘッダが「漢字 | 読み」）は触らないので、何度実行してもよい。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { ROOT } from "./import-utils.mjs";

const KANJI_DIR = join(ROOT, "src/content/articles/ja/kanji");
const dryRun = process.argv.includes("--dry");

/** 複数列に分かれた読みをつなぐ文字。セル内では「・」が使われているため読点にする。 */
const READING_SEPARATOR = "、";

async function listMarkdown(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listMarkdown(full)));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}

const isTableRow = (line) => line.startsWith("|");
const isDelimiterRow = (line) => /^\|[\s:|-]+\|?\s*$/.test(line);

function splitCells(row) {
  return row
    .replace(/^\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** 2 列（漢字・読み）の表を組み直す。変換不要なら null を返す。 */
function rebuildTable(block) {
  const rows = block.filter((line) => !isDelimiterRow(line)).map(splitCells);
  if (rows.length === 0) return null;

  // すでに変換済み
  if (rows[0][0] === "漢字" && rows[0][1] === "読み") return null;
  // 1 列目がすべて 1 文字でなければ一字表ではないので触らない
  if (!rows.every((cells) => [...(cells[0] ?? "")].length === 1)) return null;

  const out = [];
  let inherited = "";
  for (const cells of rows) {
    const kanji = cells[0];
    const readings = cells.slice(1).filter((cell) => cell !== "");
    if (readings.length > 0) inherited = readings.join(READING_SEPARATOR);
    out.push([kanji, inherited]);
  }

  const width = (text) =>
    [...text].reduce((n, ch) => n + (/[\x20-\x7e]/.test(ch) ? 1 : 2), 0);
  const kanjiWidth = Math.max(width("漢字"), ...out.map((r) => width(r[0])));
  const readingWidth = Math.max(width("読み"), ...out.map((r) => width(r[1])));
  const pad = (text, target) => text + " ".repeat(target - width(text));

  return [
    `| ${pad("漢字", kanjiWidth)} | ${pad("読み", readingWidth)} |`,
    `| ${"-".repeat(kanjiWidth)} | ${"-".repeat(readingWidth)} |`,
    ...out.map(
      ([k, r]) => `| ${pad(k, kanjiWidth)} | ${pad(r, readingWidth)} |`,
    ),
  ];
}

function fixBody(body) {
  const lines = body.split("\n");
  const out = [];
  let converted = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (!isTableRow(lines[i])) {
      out.push(lines[i]);
      continue;
    }
    const block = [];
    while (i < lines.length && isTableRow(lines[i])) {
      block.push(lines[i]);
      i += 1;
    }
    i -= 1;
    const rebuilt = rebuildTable(block);
    if (rebuilt) {
      converted += 1;
      out.push(...rebuilt);
    } else {
      out.push(...block);
    }
  }
  return { body: out.join("\n"), converted };
}

const files = await listMarkdown(KANJI_DIR);
let changedFiles = 0;
let changedTables = 0;

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const match = raw.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!match) continue;
  const [, frontmatter, body] = match;

  const { body: fixed, converted } = fixBody(body);
  if (converted === 0 || fixed === body) continue;

  changedFiles += 1;
  changedTables += converted;
  if (dryRun) {
    console.log(`\n${relative(ROOT, file)}  (表 ${converted} 個)`);
  } else {
    writeFileSync(file, frontmatter + fixed, "utf8");
  }
}

console.log(
  `\n漢字記事 ${files.length}件 / 変更 ${changedFiles}件 / 組み直した表 ${changedTables}個`,
);
if (dryRun) console.log("--dry のため書き込みはしていません。");
