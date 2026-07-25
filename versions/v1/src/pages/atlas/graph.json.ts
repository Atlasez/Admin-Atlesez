/**
 * 学習地図用のグラフデータ（ビルド時に静的生成）。
 * 概念ノード＋エッジ＋各ロケールの記事リンクを含む。
 */
import { getConcepts, getPublishedArticles } from "../../lib/content";
import { buildEdges, detectPrerequisiteCycles } from "../../lib/graph";
import { LOCALES } from "../../lib/i18n";

export async function GET() {
  const { list, map } = await getConcepts();
  const cycles = detectPrerequisiteCycles(map);
  if (cycles.length > 0) {
    throw new Error(
      `prerequisiteグラフに循環があります: ${cycles
        .map((c) => c.join(" → "))
        .join(" / ")}`,
    );
  }
  const edges = buildEdges(map);

  const articleLinks: Record<
    string,
    Record<string, { title: string; path: string }[]>
  > = {};
  for (const locale of LOCALES) {
    const articles = await getPublishedArticles(locale);
    for (const a of articles) {
      for (const c of a.data.concepts) {
        articleLinks[c.id] ??= {};
        articleLinks[c.id][locale] ??= [];
        articleLinks[c.id][locale].push({
          title: a.data.title,
          path: `/atlas/${locale}/${a.data.subject}/${a.data.category}/${a.data.slug}/`,
        });
      }
    }
  }

  return new Response(
    JSON.stringify({
      nodes: list.map((c) => ({
        id: c.id,
        subject: c.subject,
        category: c.category,
        name: c.name,
        prerequisites: c.prerequisites,
        recommendedNext: c.recommendedNext,
        related: c.related,
        partOf: c.partOf ?? null,
        alternatives: c.alternatives,
        articles: articleLinks[c.id] ?? {},
      })),
      edges,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}
