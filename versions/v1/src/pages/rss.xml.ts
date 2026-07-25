import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
  const news = (
    await getCollection("news", (n) => n.data.status === "published")
  ).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return rss({
    title: "Atlasez お知らせ",
    description: "学生団体Atlasezからのお知らせ",
    site: context.site ?? "https://atlasez.github.io",
    items: news.map((n) => ({
      title: n.data.title,
      description: n.data.summary,
      pubDate: n.data.date,
      link: `${base}/news/${n.id.replace(/\.md$/, "")}/`,
    })),
    customData: "<language>ja</language>",
  });
}
