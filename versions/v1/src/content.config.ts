import { defineCollection, z } from "astro:content";
import { glob, file } from "astro/loaders";
import { parse as parseYaml } from "yaml";

/** 対応ロケール（記事が存在しうる言語） */
export const LOCALES = ["ja", "en"] as const;
export const localeSchema = z.enum(LOCALES);

/** 多言語ラベル（jaは必須、他は任意） */
const localized = z.object({ ja: z.string(), en: z.string().optional() });

/** 概念ID: subject.category.name 形式の永続ID */
export const conceptIdSchema = z
  .string()
  .regex(
    /^[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+$/,
    "概念IDは subject.category.name 形式（例: math.set-theory.sets）",
  );

const slugSchema = z.string().regex(/^[a-z0-9-]+$/);

/** 分野（大分類カテゴリを内包） */
const subjects = defineCollection({
  loader: file("./src/content/subjects/subjects.yaml", {
    parser: (text) => parseYaml(text),
  }),
  schema: z.object({
    slug: slugSchema,
    name: localized,
    status: z.enum(["published", "preparing"]),
    order: z.number().int(),
    description: localized,
    /** 段階移行中: 現行Google Sitesへの一時リンク */
    externalUrl: z.string().url().optional(),
    categories: z
      .array(
        z.object({
          id: slugSchema,
          slug: slugSchema,
          name: localized,
          description: localized,
          order: z.number().int(),
          /** 入口となる概念 */
          entryConceptIds: z.array(conceptIdSchema).default([]),
          /** 関連カテゴリ（ミニ地図用） */
          relatedCategoryIds: z.array(slugSchema).default([]),
        }),
      )
      .default([]),
  }),
});

/** 言語非依存の概念層（分野ごとに1ファイル、配列で記述） */
const concepts = defineCollection({
  loader: file("./src/content/concepts/concepts.yaml", {
    parser: (text) => parseYaml(text),
  }),
  schema: z.object({
    subject: slugSchema,
    category: slugSchema,
    name: localized,
    /** 理解の前提となる概念 */
    prerequisites: z.array(conceptIdSchema).default([]),
    /** 次に学ぶことを推奨 */
    recommendedNext: z.array(conceptIdSchema).default([]),
    /** 関連項目 */
    related: z.array(conceptIdSchema).default([]),
    /** 包含関係（親概念・大分類） */
    partOf: conceptIdSchema.optional(),
    /** 別経路・別解説 */
    alternatives: z.array(conceptIdSchema).default([]),
  }),
});

export const difficultySchema = z.enum([
  "introductory",
  "basic",
  "intermediate",
  "advanced",
]);

/** 言語別の記事層 */
const articles = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/articles",
    // slug frontmatterではなくファイルパスをIDにする（ja/enで同名slugを許すため）
    generateId: ({ entry }) => entry.replace(/\.md$/, ""),
  }),
  schema: z.object({
    /** 記事の永続ID（例: ja-math-sets-introduction） */
    articleId: z.string().regex(/^[a-z0-9-]+$/),
    locale: localeSchema,
    title: z.string().min(1),
    slug: slugSchema,
    subject: slugSchema,
    category: slugSchema,
    /** この記事が説明する概念（1記事が複数概念を説明できる） */
    concepts: z
      .array(
        z.object({
          id: conceptIdSchema,
          /** 記事内アンカー（省略時は記事先頭） */
          anchor: z.string().optional(),
        }),
      )
      .min(1),
    /** 記事レベルで追加する前提・関連（概念グラフに加算） */
    prerequisites: z.array(conceptIdSchema).default([]),
    related: z.array(conceptIdSchema).default([]),
    authors: z.array(z.string()).min(1),
    reviewers: z.array(z.string()).default([]),
    status: z.enum(["draft", "in-review", "published"]),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    summary: z.string().min(1),
    difficulty: difficultySchema,
    estimatedMinutes: z.number().int().positive(),
    tags: z.array(z.string()).default([]),
    aliases: z.array(z.string()).default([]),
    exerciseIds: z
      .object({
        pre: z.array(z.string()).default([]),
        post: z.array(z.string()).default([]),
      })
      .default({ pre: [], post: [] }),
    references: z
      .array(z.object({ title: z.string(), url: z.string().url().optional() }))
      .default([]),
  }),
});

/** お知らせ（公式サイト） */
const news = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/news" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.enum(["announcement", "report", "release"]),
    project: z.string().optional(),
    tags: z.array(z.string()).default([]),
    summary: z.string(),
    status: z.enum(["draft", "published"]).default("published"),
  }),
});

/** プロジェクト（公式サイト） */
const projects = defineCollection({
  loader: file("./src/content/projects/projects.yaml", {
    parser: (text) => parseYaml(text),
  }),
  schema: z.object({
    slug: slugSchema,
    name: z.string(),
    shortDescription: z.string(),
    description: z.string(),
    status: z.enum(["active", "preparing", "archived"]),
    startedAt: z.string(),
    order: z.number().int(),
    links: z
      .array(
        z.object({
          label: z.string(),
          url: z.string(),
          external: z.boolean().default(false),
        }),
      )
      .default([]),
    howToJoin: z.string().optional(),
  }),
});

export const collections = { subjects, concepts, articles, news, projects };
