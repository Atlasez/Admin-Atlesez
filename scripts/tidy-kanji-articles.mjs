/**
 * 漢字記事の体裁を整える。
 *
 *   node scripts/tidy-kanji-articles.mjs --dry   … 集計を表示するだけ
 *   node scripts/tidy-kanji-articles.mjs         … 書き換える
 *
 * 元データ（Google Sites）由来の余白・空見出しを掃除する。
 *
 *   1. 中身のない `#### 【熟語】` 見出しを削除する。
 *      見出しだけがぽつんと残り、記事に穴が空いて見えていた。
 *   2. セクション区切りの水平線 `---` を削除する。
 *      `### 見出し` で十分に区切られているうえ、水平線の上下余白が積み重なって
 *      記事が間延びしていた。
 *   3. 熟語欄の空白区切りを「・」に揃える。
 *      日本語では語間の空白が区切りなのか誤植なのか判別しづらいため。
 *
 * 何度実行してもよい。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { ROOT } from "./import-utils.mjs";

const KANJI_DIR = join(ROOT, "src/content/articles/ja/kanji");
const dryRun = process.argv.includes("--dry");

const COMPOUNDS_HEADING = "#### 【熟語】";

async function listMarkdown(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listMarkdown(full)));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}

/** セクションの終わり（見出し・水平線・本文終端）かどうか */
const isBoundary = (line) =>
  line === undefined || line.startsWith("#") || line.trim() === "---";

function tidy(body) {
  const lines = body.split("\n");
  const out = [];
  const stats = { emptyHeadings: 0, rules: 0, separators: 0 };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // 2. 水平線を落とす
    if (line.trim() === "---") {
      stats.rules += 1;
      continue;
    }

    if (line.trim() !== COMPOUNDS_HEADING) {
      out.push(line);
      continue;
    }

    // 【熟語】見出し。中身を集める
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j += 1;
    const content = [];
    while (
      j < lines.length &&
      !isBoundary(lines[j]) &&
      lines[j].trim() !== ""
    ) {
      content.push(lines[j].trim());
      j += 1;
    }

    // 1. 中身がなければ見出しごと落とす
    if (content.length === 0) {
      stats.emptyHeadings += 1;
      i = j - 1;
      continue;
    }

    // 3. 空白区切りを「・」に揃える
    const text = content.join(" ").trim();
    const normalized = text.replace(/[ 　]+/g, "・");
    if (normalized !== text) stats.separators += 1;

    out.push(line, "", normalized);
    i = j - 1;
  }

  // 削除で生まれた 3 行以上の空行を 2 行に詰める
  const joined = out.join("\n").replace(/\n{3,}/g, "\n\n");
  return { body: `${joined.trim()}\n`, stats };
}

const files = await listMarkdown(KANJI_DIR);
const total = { files: 0, emptyHeadings: 0, rules: 0, separators: 0 };

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const match = raw.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!match) continue;
  const [, frontmatter, body] = match;

  const { body: fixed, stats } = tidy(body);
  if (fixed === body) continue;

  total.files += 1;
  total.emptyHeadings += stats.emptyHeadings;
  total.rules += stats.rules;
  total.separators += stats.separators;

  if (dryRun) {
    const detail = [
      stats.emptyHeadings && `空見出し ${stats.emptyHeadings}`,
      stats.rules && `水平線 ${stats.rules}`,
      stats.separators && `区切り ${stats.separators}`,
    ]
      .filter(Boolean)
      .join(" / ");
    console.log(`${relative(ROOT, file)}  ${detail}`);
  } else {
    writeFileSync(file, frontmatter + fixed, "utf8");
  }
}

console.log(
  `\n漢字記事 ${files.length}件 / 変更 ${total.files}件` +
    `（空の【熟語】見出し ${total.emptyHeadings} 個、水平線 ${total.rules} 本、` +
    `空白区切りの熟語 ${total.separators} 箇所）`,
);
if (dryRun) console.log("--dry のため書き込みはしていません。");
