#!/usr/bin/env node
/**
 * 記事を 1 本追加するための足場を作る。
 *
 *   npm run new:article -- --subject chemistry --category matter \
 *                          --slug gases --title 気体
 *
 * frontmatter には手で書くと間違えやすい項目（articleId・日付・推定時間・
 * 概念ID）が多いので、決まりに沿って埋めた雛形を出力する。
 * 概念が未登録なら `src/content/concepts/concepts.yaml` にも追記する。
 *
 * 出来上がるのは `status: draft` の記事。本文を書き、summary と difficulty を
 * 直してから `status: published` にする。
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  parse as parseYaml,
  parseDocument,
  stringify as stringifyYaml,
} from "yaml";
import { ROOT } from "./import-utils.mjs";

const SUBJECTS_FILE = join(ROOT, "src/content/subjects/subjects.yaml");
const CONCEPTS_FILE = join(ROOT, "src/content/concepts/concepts.yaml");

/** 分野スラッグ → 概念IDの接頭辞（既存の付け方に合わせる） */
const CONCEPT_PREFIX = {
  mathematics: "math",
  chemistry: "chem",
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) args[key] = true;
    else {
      args[key] = value;
      i += 1;
    }
  }
  return args;
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const { subject, category, slug, title } = args;
const locale = args.locale ?? "ja";
const localeDirectory = { ja: "jpn", jpn: "jpn", en: "eng", eng: "eng" }[
  locale
];
if (!localeDirectory)
  fail(`対応していない言語コードです: ${locale}（ja/jpn または en/eng）`);
const publicLocale = localeDirectory === "jpn" ? "ja" : "en";

if (!subject || !category || !slug || !title) {
  fail(
    [
      "使い方:",
      "  npm run new:article -- --subject <分野> --category <カテゴリ> --slug <URL名> --title <記事名>",
      "",
      "任意:",
      "  --concept <概念ID>   既存の概念に紐づける（省略時は subject.category.slug で新規作成）",
      "  --difficulty <段階>  introductory | basic | intermediate | advanced（既定 basic）",
      "  --locale <言語コード>  既定 ja（格納先はISO 639-3のjpn。jpn/engも指定可）",
      "",
      "例:",
      "  npm run new:article -- --subject chemistry --category matter --slug gases --title 気体",
    ].join("\n"),
  );
}

// --- 分野とカテゴリが実在するか確かめる -------------------------------------
const subjects = parseYaml(readFileSync(SUBJECTS_FILE, "utf8"));
const subjectEntry = subjects.find((s) => s.slug === subject);
if (!subjectEntry) {
  fail(
    `分野 "${subject}" は subjects.yaml にありません。\n` +
      `使える分野: ${subjects.map((s) => s.slug).join(", ")}`,
  );
}
const categoryEntry = (subjectEntry.categories ?? []).find(
  (c) => c.slug === category,
);
if (!categoryEntry) {
  fail(
    `分野 "${subject}" にカテゴリ "${category}" はありません。\n` +
      `使えるカテゴリ: ${(subjectEntry.categories ?? [])
        .map((c) => c.slug)
        .join(", ")}\n` +
      `新しいカテゴリを足す場合は subjects.yaml を先に編集してください。`,
  );
}

// --- 記事ファイルの場所 -----------------------------------------------------
const articlePath = join(
  ROOT,
  "src/content/articles",
  localeDirectory,
  subject,
  category,
  `${slug}.md`,
);
if (existsSync(articlePath)) {
  fail(`すでに存在します: ${relative(ROOT, articlePath)}`);
}

// --- 概念（なければ作る） ---------------------------------------------------
const prefix = CONCEPT_PREFIX[subject] ?? subject;
const conceptId = args.concept ?? `${prefix}.${category}.${slug}`;
const conceptsDoc = parseDocument(readFileSync(CONCEPTS_FILE, "utf8"));
const conceptExists = conceptsDoc.contents.items.some(
  (item) => item.get("id") === conceptId,
);

if (!conceptExists) {
  if (args.concept) {
    fail(
      `概念 "${conceptId}" は concepts.yaml にありません。\n` +
        `既存の概念に紐づけるならIDを確かめ、新規なら --concept を外してください。`,
    );
  }
  conceptsDoc.contents.items.push(
    conceptsDoc.createNode({
      id: conceptId,
      subject,
      category,
      name: { ja: title },
      prerequisites: [],
      recommendedNext: [],
      related: [],
      alternatives: [],
    }),
  );
  writeFileSync(CONCEPTS_FILE, conceptsDoc.toString({ lineWidth: 0 }), "utf8");
}

// --- 記事の雛形 -------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const frontmatter = {
  articleId: `${publicLocale}-${subject}-${slug}`,
  locale: publicLocale,
  title,
  slug,
  subject,
  category,
  concepts: [{ id: conceptId }],
  authors: [`atlas-${subject}-team`],
  reviewers: [],
  status: "draft",
  createdAt: today,
  updatedAt: today,
  summary: `${title}について解説します。`,
  difficulty: args.difficulty ?? "basic",
  estimatedMinutes: 10,
  tags: [title],
  aliases: [],
  exerciseIds: { pre: [], post: [] },
  references: [],
};

const body = `## ${title}

ここに本文を書きます。

- 見出しは \`##\` から始めます（\`#\` は記事タイトルとして自動で付きます）
- 数式は \`$...$\`（行内）と \`$$...$$\`（別行）で書けます
- 数式の中に日本語を入れるときは \`\\text{かつ}\` のように囲みます
`;

mkdirSync(dirname(articlePath), { recursive: true });
writeFileSync(
  articlePath,
  `---\n${stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd()}\n---\n\n${body}`,
  "utf8",
);

console.log(`
記事の雛形を作りました:
  ${relative(ROOT, articlePath)}
${conceptExists ? `既存の概念に紐づけました: ${conceptId}` : `概念を追加しました: ${conceptId}`}

次にやること:
  1. 本文を書く
  2. summary を記事の内容に合わせて書き直す
  3. difficulty と estimatedMinutes を見直す
  4. 前提となる概念があれば concepts.yaml の ${conceptId} に prerequisites を足す
  5. 公開してよくなったら status を published にする
  6. node scripts/validate-content.mjs で確かめる
`);
