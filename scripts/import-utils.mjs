import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONCEPTS_FILE = join(ROOT, "src/content/concepts/concepts.yaml");

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function cleanBody(text, title) {
  let body = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  body = body
    .replace(/^#{2,6}[ \t]*$/gm, "")
    .replace(/\n---\n\n©[^\n]*Atlasez\s*$/u, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  body = body.replace(new RegExp(`^##\\s+${escaped}\\s*\\n+`, "u"), "");
  return body;
}

function plainText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$]+\$/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[|*_`>#\[\]{}\\]/g, " ")
    .replace(/---+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 要約に使える「地の文」を先頭から順に返す。
 *
 * - 記事の冒頭（最初の見出しより前）と最初の節だけを見る。
 *   奥から拾うと文脈のない一文が要約になってしまうため。
 * - 見出し・表・箇条書き・別行立ての数式は段落ごと捨てる。
 * - インライン数式を含む文も捨てる（数式を削ると意味が通らなくなるため）。
 */
function* proseSentences(markdown) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, "\n\n")
    .replace(/\$\$[\s\S]*?\$\$/g, "\n\n");
  let headings = 0;
  for (const paragraph of text.split(/\n{2,}/)) {
    const para = paragraph.trim();
    if (!para) continue;
    if (/^#{1,6}\s/u.test(para)) {
      headings += 1;
      if (headings >= 2) return; // 第2節以降には踏み込まない
      continue;
    }
    // 表・引用・箇条書き・番号付きリストは要約に向かない
    if (/^([|>]|[-*+]\s|\d+\.\s)/u.test(para)) continue;
    for (const raw of para.split(/(?<=[。！？])/u)) {
      const sentence = raw
        .replace(/[*_`[\]\\]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!sentence) continue;
      if (sentence.includes("$")) continue;
      // 「定義 1 (関係).」のような定理環境の見出しは要約にしない
      if (/^(定義|定理|命題|補題|系|例|証明|注意|問|解)\s*\d/u.test(sentence)) {
        continue;
      }
      // 助詞や活用語尾で始まる文は、直前の別行立て数式が段落を分断した残骸。
      // （例:「…すなわち $$…$$ となるときこの群作用は推移的である.」の後半）
      if (
        /^(が|を|に|は|へ|と|で|も|や|の|から|まで|より|など|とき|となる|となり|とな|であ|でな|する|され|なる)/u.test(
          sentence,
        )
      ) {
        continue;
      }
      // 直前の文脈を受ける文は、単独で読むと意味が通らないので要約にしない
      if (
        /^(これ|それ|この|その|こう|そう|また|しかし|だが|よって|従って|したがって|すなわち|つまり|ゆえに|故に|以上|次に|同様に|一方)/u.test(
          sentence,
        )
      ) {
        continue;
      }
      yield sentence;
    }
  }
}

/** 地の文が取れない記事（語彙リスト・定義のみの記事など）の定型要約 */
function fallbackSummary(body, title, subject) {
  if (/【(一字|熟語)】/u.test(body)) {
    return `「${title}」に関わる漢字を、字義や熟語の用例とともに整理した語彙学習記事です。`;
  }
  if (subject === "mathematics") {
    return `「${title}」の定義と基本性質を、式や命題を通して確認する数学記事です。`;
  }
  if (subject === "kobun") {
    return `古文「${title}」の本文理解に必要な語句や背景を解説する学習記事です。`;
  }
  if (subject === "physics") {
    return `物理における「${title}」の考え方と基本的な関係式を解説する学習記事です。`;
  }
  if (subject === "chemistry") {
    return `化学における「${title}」の仕組みと基本事項を整理した学習記事です。`;
  }
  if (subject === "biology") {
    return `生物における「${title}」の仕組みと働きを整理した学習記事です。`;
  }
  return `「${title}」の基礎事項と関連する考え方を整理した学習記事です。`;
}

export function makeSummary(body, title, subject) {
  for (const sentence of proseSentences(body)) {
    // 短すぎる断片と、長すぎて途中で切らざるを得ない文は飛ばす
    if (sentence.length < 15 || sentence.length > 160) continue;
    return sentence;
  }
  return fallbackSummary(body, title, subject);
}

export function estimateMinutes(body) {
  return Math.max(5, Math.min(45, Math.ceil(plainText(body).length / 350) * 5));
}

export function writeArticle({
  subject,
  category,
  slug,
  title,
  conceptId,
  author,
  body,
  difficulty = "basic",
  createdAt = "2024-01-01",
  updatedAt = "2026-07-22",
}) {
  const articleId = `ja-${subject}-${slug}`;
  const data = {
    articleId,
    locale: "ja",
    title,
    slug,
    subject,
    category,
    concepts: [{ id: conceptId }],
    authors: [author],
    reviewers: [],
    status: "published",
    createdAt,
    updatedAt,
    summary: makeSummary(body, title, subject),
    difficulty,
    estimatedMinutes: estimateMinutes(body),
    tags: [title],
    aliases: [],
    exerciseIds: { pre: [], post: [] },
    references: [],
  };
  const file = join(
    ROOT,
    "src/content/articles/ja",
    subject,
    category,
    `${slug}.md`,
  );
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `---\n${stringifyYaml(data).trim()}\n---\n\n${body}\n`);
  return file;
}

export function appendConcepts(concepts, heading) {
  const existing = parseYaml(readFileSync(CONCEPTS_FILE, "utf8"));
  const ids = new Set(existing.map((concept) => concept.id));
  const additions = concepts.filter((concept) => !ids.has(concept.id));
  if (additions.length === 0) return 0;
  const current = readFileSync(CONCEPTS_FILE, "utf8").trimEnd();
  writeFileSync(
    CONCEPTS_FILE,
    `${current}\n\n# ---------- ${heading} ----------\n${stringifyYaml(additions).trim()}\n`,
  );
  return additions.length;
}
