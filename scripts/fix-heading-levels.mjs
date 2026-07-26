/**
 * 記事本文の見出しレベルを繰り上げて、ページの h1 に続くようにする。
 *
 *   node scripts/fix-heading-levels.mjs --dry   … 集計を表示するだけ
 *   node scripts/fix-heading-levels.mjs         … 書き換える
 *
 * 記事ページの h1 は記事タイトル（テンプレート側）。ところが本文の多くは
 * `### 見出し` から始まっており、h1 → h3 と 1 段飛んでいた。
 * 見出しレベルの飛びはスクリーンリーダーの見出しジャンプを乱すうえ、
 * 目次（深さ 3 まで）の拾い方もちぐはぐになる。
 *
 * 本文の最も浅い見出しが h2 になるように、記事ごとに一律で繰り上げる。
 * すでに h2 から始まる記事は触らない。コードブロック内の `#` も触らない。
 *
 * 何度実行してもよい。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { ROOT } from "./import-utils.mjs";

const ARTICLES_DIR = join(ROOT, "src/content/articles");
const dryRun = process.argv.includes("--dry");

async function listMarkdown(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listMarkdown(full)));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}

/** コードブロックの外にある見出しだけを対象に、行ごとの処理を行う */
function mapHeadings(body, fn) {
  let inFence = false;
  return body
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      const match = line.match(/^(#{1,6})(\s+.*)$/);
      if (!match) return line;
      return fn(match[1].length, match[2], line);
    })
    .join("\n");
}

function shallowestLevel(body) {
  let min = Infinity;
  mapHeadings(body, (level, _rest, line) => {
    min = Math.min(min, level);
    return line;
  });
  return min;
}

const files = await listMarkdown(ARTICLES_DIR);
let changedFiles = 0;
let changedHeadings = 0;

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const match = raw.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!match) continue;
  const [, frontmatter, body] = match;

  const shallowest = shallowestLevel(body);
  if (!Number.isFinite(shallowest) || shallowest <= 2) continue;

  const shift = shallowest - 2;
  let count = 0;
  const fixed = mapHeadings(body, (level, rest) => {
    count += 1;
    return "#".repeat(Math.max(2, level - shift)) + rest;
  });

  changedFiles += 1;
  changedHeadings += count;
  if (dryRun) {
    console.log(
      `${relative(ROOT, file)}  h${shallowest}始まり → h2始まり（見出し ${count} 個）`,
    );
  } else {
    writeFileSync(file, frontmatter + fixed, "utf8");
  }
}

console.log(
  `\n記事 ${files.length}件 / 変更 ${changedFiles}件 / 繰り上げた見出し ${changedHeadings}個`,
);
if (dryRun) console.log("--dry のため書き込みはしていません。");
