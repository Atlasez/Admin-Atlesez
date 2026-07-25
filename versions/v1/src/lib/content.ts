/**
 * コンテンツ横断ユーティリティ:
 * 概念グラフとfrontmatterから前提記事・関連記事・次に読む記事・翻訳を自動導出する。
 */
import { getCollection, type CollectionEntry } from "astro:content";
import type { Locale } from "./i18n";
import { toConceptMap, type ConceptData, type ConceptMap } from "./graph";

export type Article = CollectionEntry<"articles">;
export type Subject = CollectionEntry<"subjects">;

let conceptCache: { list: ConceptData[]; map: ConceptMap } | null = null;

export async function getConcepts(): Promise<{
  list: ConceptData[];
  map: ConceptMap;
}> {
  if (conceptCache) return conceptCache;
  const entries = await getCollection("concepts");
  const list: ConceptData[] = entries.map((e) => ({
    id: e.id,
    subject: e.data.subject,
    category: e.data.category,
    name: e.data.name,
    prerequisites: e.data.prerequisites,
    recommendedNext: e.data.recommendedNext,
    related: e.data.related,
    partOf: e.data.partOf,
    alternatives: e.data.alternatives,
  }));
  conceptCache = { list, map: toConceptMap(list) };
  return conceptCache;
}

/** 公開済み記事のみ（本番に出るのはこれだけ） */
export async function getPublishedArticles(
  locale?: Locale,
): Promise<Article[]> {
  const all = await getCollection("articles", (a) => {
    if (a.data.status !== "published") return false;
    if (locale && a.data.locale !== locale) return false;
    return true;
  });
  return all.sort((a, b) => a.data.title.localeCompare(b.data.title, "ja"));
}

export async function getPublishedSubjects(): Promise<Subject[]> {
  const subjects = await getCollection("subjects");
  return subjects.sort((a, b) => a.data.order - b.data.order);
}

/** 概念ID → その概念を説明する記事（ロケール別） */
export function indexArticlesByConcept(
  articles: Article[],
): Map<string, Article[]> {
  const index = new Map<string, Article[]>();
  for (const a of articles) {
    for (const c of a.data.concepts) {
      const arr = index.get(c.id) ?? [];
      arr.push(a);
      index.set(c.id, arr);
    }
  }
  return index;
}

/** 記事が扱う概念の前提概念（記事frontmatterの追加前提も合算） */
export function articlePrerequisiteConceptIds(
  article: Article,
  map: ConceptMap,
): string[] {
  const own = new Set(article.data.concepts.map((c) => c.id));
  const result = new Set<string>(article.data.prerequisites);
  for (const c of article.data.concepts) {
    const node = map.get(c.id);
    for (const p of node?.prerequisites ?? []) {
      if (!own.has(p)) result.add(p);
    }
  }
  return [...result];
}

/** 前提記事: 前提概念を説明する同ロケールの公開記事 */
export function prerequisiteArticles(
  article: Article,
  map: ConceptMap,
  byConcept: Map<string, Article[]>,
): Article[] {
  return uniqueArticles(
    articlePrerequisiteConceptIds(article, map).flatMap(
      (id) => byConcept.get(id) ?? [],
    ),
    article,
  );
}

/** 次に読む記事: recommendedNext概念の記事、なければこの記事の概念を前提とする記事 */
export function nextArticles(
  article: Article,
  map: ConceptMap,
  byConcept: Map<string, Article[]>,
  allArticles: Article[],
): Article[] {
  const own = new Set(article.data.concepts.map((c) => c.id));
  const nextIds = new Set<string>();
  for (const c of article.data.concepts) {
    for (const n of map.get(c.id)?.recommendedNext ?? []) nextIds.add(n);
  }
  let candidates = [...nextIds].flatMap((id) => byConcept.get(id) ?? []);
  if (candidates.length === 0) {
    candidates = allArticles.filter((a) =>
      a.data.concepts.some((c) =>
        (map.get(c.id)?.prerequisites ?? []).some((p) => own.has(p)),
      ),
    );
  }
  return uniqueArticles(candidates, article).slice(0, 5);
}

/** 関連記事: related概念＋frontmatter related の記事 */
export function relatedArticles(
  article: Article,
  map: ConceptMap,
  byConcept: Map<string, Article[]>,
): Article[] {
  const relIds = new Set<string>(article.data.related);
  for (const c of article.data.concepts) {
    for (const r of map.get(c.id)?.related ?? []) relIds.add(r);
    for (const alt of map.get(c.id)?.alternatives ?? []) relIds.add(alt);
  }
  return uniqueArticles(
    [...relIds].flatMap((id) => byConcept.get(id) ?? []),
    article,
  ).slice(0, 6);
}

/**
 * 翻訳: 他ロケールで同じ概念を1つでも扱う公開記事。
 * 一対一対応を仮定しない（1記事に複数の対応記事がありうる）。
 */
export function translationArticles(
  article: Article,
  allLocalesArticles: Article[],
): Map<Locale, Article[]> {
  const ownConcepts = new Set(article.data.concepts.map((c) => c.id));
  const result = new Map<Locale, Article[]>();
  for (const a of allLocalesArticles) {
    if (a.data.locale === article.data.locale) continue;
    if (a.data.status !== "published") continue;
    if (a.data.concepts.some((c) => ownConcepts.has(c.id))) {
      const arr = result.get(a.data.locale) ?? [];
      arr.push(a);
      result.set(a.data.locale, arr);
    }
  }
  return result;
}

function uniqueArticles(articles: Article[], exclude?: Article): Article[] {
  const seen = new Set<string>();
  const result: Article[] = [];
  for (const a of articles) {
    if (exclude && a.data.articleId === exclude.data.articleId) continue;
    if (exclude && a.data.locale !== exclude.data.locale) continue;
    if (seen.has(a.data.articleId)) continue;
    seen.add(a.data.articleId);
    result.push(a);
  }
  return result;
}
