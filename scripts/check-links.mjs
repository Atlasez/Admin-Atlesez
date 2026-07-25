#!/usr/bin/env node
/**
 * 内部リンク検証: ビルド済みHTML内のhref/srcのうち内部リンクが
 * 実在するファイルを指しているか確認する。
 * 使い方: node scripts/check-links.mjs <distディレクトリ> [ベースパス]
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const dist = process.argv[2] ?? "dist";
const basePath = (process.argv[3] ?? "/").replace(/\/$/, "");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

const files = walk(dist);
const errors = [];
const hrefRe = /(?:href|src)="([^"#]*)(?:#[^"]*)?"/g;

for (const file of files) {
  const html = readFileSync(file, "utf8");
  for (const m of html.matchAll(hrefRe)) {
    let url = m[1];
    if (
      url === "" ||
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("mailto:") ||
      url.startsWith("data:") ||
      url.startsWith("//")
    ) {
      continue;
    }
    if (basePath && url.startsWith(basePath)) url = url.slice(basePath.length);
    if (!url.startsWith("/")) continue; // 相対リンクは対象外（記事内では使わない方針）
    const clean = url.split("?")[0];
    const candidates = [
      join(dist, clean),
      join(dist, clean, "index.html"),
      join(dist, `${clean.replace(/\/$/, "")}.html`),
    ];
    if (!candidates.some((c) => existsSync(c))) {
      errors.push(`${file.replace(dist, "")}: リンク切れ ${m[1]}`);
    }
  }
}

const unique = [...new Set(errors)];
if (unique.length > 0) {
  console.error(`内部リンク切れ: ${unique.length}件`);
  for (const e of unique.slice(0, 50)) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`内部リンクOK: ${files.length}ファイルを検査`);
