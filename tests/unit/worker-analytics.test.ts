import { describe, expect, it } from "vitest";
import worker from "../../src/worker";

const analyticsRequest = (regionCode: string, country = "JP") => {
  const request = new Request("https://atlas.example/api/article-analytics", {
    method: "POST",
    headers: {
      origin: "https://atlas.example",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      articleId: "article-id",
      articleTitle: "記事",
      subject: "mathematics",
      category: "algebra",
      locale: "ja",
      event: "view",
    }),
  });
  Object.defineProperty(request, "cf", { value: { country, regionCode } });
  return request;
};

describe("article analytics regional aggregation", () => {
  it("stores only the Japanese region code alongside the article aggregate", async () => {
    const queries: string[] = [];
    const values: unknown[][] = [];
    const response = await worker.fetch(
      analyticsRequest("JP-13"),
      {
        ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
        REPORTS: {
          prepare: (query: string) => ({
            bind: (...bound: unknown[]) => {
              values.push(bound);
              return {
                run: async () => {
                  queries.push(query);
                  return {};
                },
              };
            },
          }),
        },
      } as never,
      {} as never,
    );

    expect(response.status).toBe(201);
    expect(queries).toHaveLength(2);
    expect(queries[1]).toContain("article_analytics_region_daily");
    expect(values[1]).toContain("JP-13");
  });

  it("does not create a regional row for non-Japanese traffic", async () => {
    const queries: string[] = [];
    const response = await worker.fetch(
      analyticsRequest("US-CA", "US"),
      {
        ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
        REPORTS: {
          prepare: (query: string) => ({
            bind: () => ({
              run: async () => {
                queries.push(query);
                return {};
              },
            }),
          }),
        },
      } as never,
      {} as never,
    );

    expect(response.status).toBe(201);
    expect(queries).toHaveLength(1);
  });
});
