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

export function makeSummary(body, title) {
  const text = plainText(body);
  if (!text) return `${title}について解説します。`;
  const sentence =
    text.match(/^.{1,118}?[。！？](?:\s|$)/u)?.[0] ?? text.slice(0, 110);
  return sentence.length < text.length && !/[。！？]$/u.test(sentence)
    ? `${sentence}…`
    : sentence;
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
    summary: makeSummary(body, title),
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
