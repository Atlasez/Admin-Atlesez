#!/usr/bin/env node
/**
 * UI 表示言語の網羅状況を調べる。
 *
 *   npm run build && node scripts/check-ui-translations.mjs
 *
 * ビルド結果の HTML から「画面まわりの日本語」を集め、
 * `src/lib/ui-locales.ts` の辞書に無いものを一覧する。
 * 記事本文・記事タイトル・パンくず・概念名などは翻訳対象外なので除外する。
 *
 * 全ページの 5% 以上に出てくる文字列を「共通UI」とみなす。
 * 特定の記事にしか出ない文字列は内容とみなして無視する。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { UI_DICTIONARY } from "../src/lib/ui-locales.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");

/** 翻訳してはいけない領域（記事の中身・固有名詞） */
const EXCLUDE = [
  ".article-body",
  ".katex",
  "script",
  "style",
  "#article-title",
  ".breadcrumb",
  ".subject-name",
  ".subject-desc",
  ".subject-home > h1",
  ".map-breadcrumb",
  "[aria-current='page']",
  ".recent-list",
  ".upcoming-list",
  ".toc-list",
  ".aside-links",
  ".concept-list",
  ".subject-list",
  ".category-list",
  ".group-heading",
  ".genre-heading",
  ".legend-list",
  ".subject-legend",
  "[data-search-results]",
  ".map-canvas",
  "option",
  "datalist",
  ".map-data",
  "[data-pagefind-filter]",
  "[data-pagefind-meta]",
  ".article-badges time",
  ".upcoming-category",
];

/** 記号だけ・数字混じりなど、翻訳の必要がないもの */
const IGNORE = new Set(["・", "|", "/"]);
/** 記事数は数値を含む動的表示で、ラベル部分の「記事」は別途辞書化済み。 */
const IGNORE_PATTERNS = [/^記事:\s*\d+$/];

const JAPANESE = /[ぁ-ゟ゠-ヿ㐀-鿿]/;

function collectHtml(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectHtml(full));
    else if (entry.name === "index.html") out.push(full);
  }
  return out;
}

// UI_LANGUAGE は学習サイトにだけ読み込まれる。公式サイトや認証必須の
// 運営画面まで数えると、実際には翻訳対象でない管理用語が「未翻訳」として
// 大量に混ざるため、/atlas/ 配下だけを監査する。
const files = collectHtml(distDir).filter((file) =>
  relative(distDir, file).replaceAll("\\", "/").startsWith("atlas/"),
);
const counts = new Map();

for (const file of files) {
  const dom = new JSDOM(readFileSync(file, "utf8"));
  const doc = dom.window.document;
  for (const selector of EXCLUDE) {
    doc.querySelectorAll(selector).forEach((node) => node.remove());
  }

  const walker = doc.createTreeWalker(
    doc.body,
    dom.window.NodeFilter.SHOW_TEXT,
  );
  let node = walker.nextNode();
  while (node) {
    const text = (node.textContent ?? "").trim().replace(/\s+/g, " ");
    if (text && JAPANESE.test(text) && text.length <= 70) {
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
    node = walker.nextNode();
  }
  for (const attr of ["aria-label", "placeholder", "title"]) {
    for (const el of doc.querySelectorAll(`[${attr}]`)) {
      const text = (el.getAttribute(attr) ?? "").trim();
      if (text && JAPANESE.test(text) && text.length <= 70) {
        counts.set(text, (counts.get(text) ?? 0) + 1);
      }
    }
  }
}

const threshold = Math.max(2, files.length * 0.05);
const shared = [...counts.entries()]
  .filter(([, n]) => n >= threshold)
  .sort((a, b) => b[1] - a[1]);

const missing = shared.filter(
  ([text]) =>
    !UI_DICTIONARY[text] &&
    !IGNORE.has(text) &&
    !IGNORE_PATTERNS.some((pattern) => pattern.test(text)),
);
const covered = shared.length - missing.length;
const rate = shared.length === 0 ? 100 : (covered / shared.length) * 100;

console.log(
  `全 ${files.length} ページ / 共通UI文字列 ${shared.length}件 / ` +
    `辞書にある ${covered}件（${rate.toFixed(1)}%）`,
);

if (missing.length > 0) {
  console.log("\n辞書に無い文字列（翻訳するか、内容なら EXCLUDE に足す）:");
  for (const [text, n] of missing)
    console.log(`  ${String(n).padStart(4)}  ${text}`);
}
