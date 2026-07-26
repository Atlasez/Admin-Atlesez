/**
 * 数式の中に生で置かれた日本語を `\text{}` で包む。
 *
 *   node scripts/fix-math-japanese.mjs --dry   … 変更点を表示するだけ
 *   node scripts/fix-math-japanese.mjs         … 書き換える
 *
 * KaTeX は数式モードの文字を数式用フォントの斜体で組むため、
 * `(Tは定数)` や `x=x'かつy=y'` のように日本語をそのまま書くと
 * 字形も字間も崩れる（ビルド時に unicodeTextInMathMode 警告も出る）。
 * `\text{}` で包めば通常のテキストとして組まれる。
 *
 * すでに `\text{}` や `\mathrm{}` の中にある日本語は触らない。
 * 何度実行してもよい。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { ROOT } from "./import-utils.mjs";

const ARTICLES_DIR = join(ROOT, "src/content/articles");
const dryRun = process.argv.includes("--dry");

/** 日本語（かな・カタカナ・漢字・長音など） */
const JP = "\\u3041-\\u309f\\u30a0-\\u30ff\\u3400-\\u9fff\\u3005\\u3006\\u30fc";
/**
 * 日本語で始まり日本語で終わる連なり。間の英数字は取り込む
 * （「は1点集合」を分断しないため）。
 */
const JP_RUN = new RegExp(`[${JP}](?:[${JP}0-9A-Za-z]*[${JP}])?`, "gu");

/** テキストとして組まれる命令。この中の日本語は既に正しいので触らない。 */
const TEXT_COMMANDS =
  /\\(?:text|textbf|textit|textrm|mathrm|mathbf|mbox|operatorname)\s*\{/y;

async function listMarkdown(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listMarkdown(full)));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}

/** 数式 1 つ分の中身を処理して、生の日本語を \text{} で包む */
function wrapJapanese(math) {
  let out = "";
  let plain = "";

  const flush = () => {
    if (!plain) return;
    out += plain.replace(JP_RUN, (run) => `\\text{${run}}`);
    plain = "";
  };

  let i = 0;
  while (i < math.length) {
    TEXT_COMMANDS.lastIndex = i;
    const cmd = TEXT_COMMANDS.exec(math);
    if (cmd && cmd.index === i) {
      // \text{...} は中身ごとそのまま通す（入れ子の波括弧も数える）
      flush();
      let depth = 1;
      let j = i + cmd[0].length;
      while (j < math.length && depth > 0) {
        if (math[j] === "\\") j += 1;
        else if (math[j] === "{") depth += 1;
        else if (math[j] === "}") depth -= 1;
        j += 1;
      }
      out += math.slice(i, j);
      i = j;
      continue;
    }
    if (math[i] === "\\") {
      // エスケープは 2 文字で 1 つ（\{ や \, など）
      plain += math.slice(i, i + 2);
      i += 2;
      continue;
    }
    plain += math[i];
    i += 1;
  }
  flush();
  return out;
}

/** 本文中の数式を走査する。コードブロックは対象外。 */
function fixBody(body) {
  let changed = 0;
  const segments = body.split(/(```[\s\S]*?```)/);

  const fixed = segments.map((segment) => {
    if (segment.startsWith("```")) return segment;
    // $$...$$ を先に処理してから $...$ を処理する
    return segment
      .replace(/\$\$([\s\S]*?)\$\$/g, (_whole, inner) => {
        const next = wrapJapanese(inner);
        if (next !== inner) changed += 1;
        return `$$${next}$$`;
      })
      .replace(/\$([^$\n]+)\$/g, (_whole, inner) => {
        const next = wrapJapanese(inner);
        if (next !== inner) changed += 1;
        return `$${next}$`;
      });
  });

  return { body: fixed.join(""), changed };
}

const files = await listMarkdown(ARTICLES_DIR);
let changedFiles = 0;
let changedSpans = 0;

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const match = raw.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!match) continue;
  const [, frontmatter, body] = match;

  const { body: fixedBody, changed } = fixBody(body);
  if (changed === 0 || fixedBody === body) continue;

  changedFiles += 1;
  changedSpans += changed;
  if (dryRun) {
    console.log(`\n${relative(ROOT, file)}  (数式 ${changed} 箇所)`);
  } else {
    writeFileSync(file, frontmatter + fixedBody, "utf8");
  }
}

console.log(
  `\n記事 ${files.length}件 / 変更 ${changedFiles}件 / 包んだ数式 ${changedSpans}箇所`,
);
if (dryRun) console.log("--dry のため書き込みはしていません。");
