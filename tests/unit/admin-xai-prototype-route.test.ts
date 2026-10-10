import { describe, expect, it, vi } from "vitest";
import worker from "../../src/admin-worker";

describe("independent xAI prototype static route", () => {
  it("serves the prototype and its assets without an ADMIN session", async () => {
    const requests: Request[] = [];
    const env = {
      ASSETS: {
        fetch: vi.fn(async (request: Request) => {
          requests.push(request);
          return new Response("prototype fixture", {
            headers: { "content-type": "text/html" },
          });
        }),
      },
    };

    const page = await worker.fetch(
      new Request("https://admin.atlasez.test/xai-prototype/"),
      env as never,
    );
    const asset = await worker.fetch(
      new Request("https://admin.atlasez.test/xai-prototype/_astro/site.css"),
      env as never,
    );

    expect(page.status).toBe(200);
    expect(asset.status).toBe(200);
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/xai-prototype/",
      "/xai-prototype/_astro/site.css",
    ]);
  });

  it("does not match adjacent routes or allow writes", async () => {
    const fetch = vi.fn(async () => new Response("prototype fixture"));
    const env = { ASSETS: { fetch } };
    const adjacent = await worker.fetch(
      new Request("https://admin.atlasez.test/xai-prototype-private/"),
      env as never,
    );
    const write = await worker.fetch(
      new Request("https://admin.atlasez.test/xai-prototype/", {
        method: "POST",
      }),
      env as never,
    );

    expect(adjacent.status).toBe(404);
    expect(write.status).toBe(405);
    expect(write.headers.get("allow")).toBe("GET, HEAD");
    expect(fetch).not.toHaveBeenCalled();
  });
});
