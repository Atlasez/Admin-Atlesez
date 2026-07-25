#!/usr/bin/env node
/** 現行Google Sitesの公開「運営紹介」から、アトラス担当者をJSONへ移植する。 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SOURCE_URL =
  "https://sites.google.com/view/atlasez/atlasez%E3%81%A8%E3%81%AF/%E9%81%8B%E5%96%B6%E7%B4%B9%E4%BB%8B";
const output = resolve("src/data/atlas-members.json");

const response = await fetch(SOURCE_URL);
if (!response.ok) {
  throw new Error(`運営紹介を取得できませんでした: HTTP ${response.status}`);
}

const html = await response.text();
const pageStart = html.lastIndexOf(">運営紹介</span></h2>");
if (pageStart < 0) throw new Error("運営紹介の本文を検出できませんでした");

function text(fragment) {
  return fragment
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const members = [];
for (const section of html
  .slice(pageStart)
  .split(/<h3[^>]*>/i)
  .slice(1)) {
  const headingEnd = section.indexOf("</h3>");
  if (headingEnd < 0) continue;

  const name = text(section.slice(0, headingEnd));
  const body = section.slice(headingEnd + 5).split(/<h3[^>]*>/i)[0];
  const lines = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => text(match[1]))
    .filter(Boolean);
  const roleIndex = lines.findIndex((line) => line.startsWith("役職・担当："));
  if (roleIndex < 0) continue;

  const role = lines[roleIndex].replace("役職・担当：", "");
  if (role !== "代表" && !role.includes("学習サイト「アトラス」運営")) {
    continue;
  }

  const bioIndex = lines.findIndex((line) => line.startsWith("自己紹介："));
  const nextLabelIndex = lines.findIndex(
    (line, index) =>
      index > bioIndex && /^(役職・担当：|ポートフォリオ)/.test(line),
  );
  const bio =
    bioIndex < 0
      ? ""
      : lines
          .slice(bioIndex, nextLabelIndex < 0 ? undefined : nextLabelIndex)
          .join(" ")
          .replace("自己紹介：", "")
          .trim();

  members.push({
    name,
    affiliation: lines[0] ?? "",
    role,
    bio,
  });
}

if (members.length < 10) {
  throw new Error(`取得件数が少なすぎます: ${members.length}件`);
}

const data = {
  source: SOURCE_URL,
  importedAt: new Date().toISOString(),
  note: "現行サイトの公開情報を移植。所属は現行ページの注記に従い、*なしは2025年4月以降の所属。",
  members,
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`運営紹介を移植しました: ${members.length}名 → ${output}`);
