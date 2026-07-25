/**
 * 既存記事の frontmatter の summary を作り直す。
 *
 *   node scripts/regenerate-summaries.mjs --dry   … 差分を表示するだけ
 *   node scripts/regenerate-summaries.mjs --list  … 定型文のままの記事を一覧する
 *   node scripts/regenerate-summaries.mjs         … 書き換える
 *
 * 旧インポータは本文の冒頭を機械的に切り出しており、インライン数式が
 * 抜け落ちた文が途中で「…」で切れる要約が量産されていた。
 * makeSummary（scripts/import-utils.mjs）の新ロジックで生成し直す。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { ROOT, makeSummary } from "./import-utils.mjs";

const ARTICLES_DIR = join(ROOT, "src/content/articles");
const dryRun = process.argv.includes("--dry");
const listOnly = process.argv.includes("--list");

/** makeSummary が生成する定型文かどうか */
const FALLBACK_PATTERN =
  /^「.+」(に関係する漢字と熟語をまとめています。|について、定義と基本的な性質をまとめています。|について解説します。)$/u;

async function listMarkdown(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listMarkdown(full)));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}

function splitFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("frontmatterが見つかりません");
  return { frontmatter: match[1], body: match[2] };
}

const files = await listMarkdown(ARTICLES_DIR);
let changed = 0;
const fallbackUsed = [];

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const { frontmatter, body } = splitFrontmatter(raw);
  const data = parseYaml(frontmatter);
  const rel = relative(ROOT, file);
  const current = String(data.summary ?? "").trim();

  if (listOnly) {
    if (FALLBACK_PATTERN.test(current)) fallbackUsed.push(rel);
    continue;
  }

  // 手書きの要約は触らない。壊れている（末尾が「…」）ものだけ作り直す。
  if (!/(…|\.\.\.)$/u.test(current)) continue;

  // 旧要約は数式が抜けたり見出しが混ざったりしているので、末尾の「…」を
  // 落とすだけでは直らない。必ず本文から作り直す。
  const next = makeSummary(body, data.title, data.subject);
  if (FALLBACK_PATTERN.test(next)) fallbackUsed.push(rel);

  if (current === next) continue;

  changed += 1;
  if (dryRun) {
    console.log(`\n${rel}`);
    console.log(`  - ${data.summary}`);
    console.log(`  + ${next}`);
  } else {
    data.summary = next;
    const yaml = stringifyYaml(data, { lineWidth: 0 }).trimEnd();
    writeFileSync(file, `---\n${yaml}\n---\n\n${body.trim()}\n`, "utf8");
  }
}

if (listOnly) {
  console.log(
    `全 ${files.length}件 中、要約が定型文のまま ${fallbackUsed.length}件:`,
  );
  for (const f of fallbackUsed) console.log(f);
} else {
  console.log(
    `\n全 ${files.length}件 / 変更 ${changed}件（うち定型文へ ${fallbackUsed.length}件）`,
  );
  if (fallbackUsed.length > 0) {
    console.log("\n本文から要約を作れず定型文にした記事（手書き推奨）:");
    for (const f of fallbackUsed) console.log(`  ${f}`);
  }
  if (dryRun) console.log("\n--dry のため書き込みはしていません。");
}
