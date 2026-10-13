import { describe, expect, it, vi } from "vitest";
import worker from "../../src/admin-worker";

class SyncStatement {
  values: unknown[] = [];

  constructor(
    readonly query: string,
    readonly onRun: (query: string, values: unknown[]) => void,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async all<T>() {
    if (this.query.includes("FROM editorial_documents"))
      return {
        results: Array.from({ length: 9 }, (_, index) => ({
          id: `document-${String(index + 1).padStart(2, "0")}`,
          locale: "ja",
          subject: "mathematics",
          category: "overview",
          slug: `article-${index + 1}`,
          published_at: null,
          publication_action: null,
        })) as T[],
      };
    return { results: [] as T[] };
  }

  async first<T>() {
    return null as T | null;
  }

  async run() {
    this.onRun(this.query, this.values);
    return { meta: { changes: 1 } };
  }
}

const runScheduled = async (cron: string, env: Record<string, unknown>) => {
  const pending: Promise<unknown>[] = [];
  await worker.scheduled({ cron }, env as never, {
    waitUntil: (promise: Promise<unknown>) => pending.push(promise),
  });
  await Promise.all(pending);
};

describe("admin scheduled GitHub syncs", () => {
  it("fails visibly when article backup GitHub credentials are missing", async () => {
    let databaseCalls = 0;
    await expect(
      runScheduled("1-59/2 * * * *", {
        REPORTS: {
          prepare: () => {
            databaseCalls += 1;
            return new SyncStatement("unused", () => undefined);
          },
        },
      }),
    ).rejects.toThrow("記事バックアップのGitHub認証が設定されていません。");
    expect(databaseCalls).toBe(0);
  });

  it("limits editorial publication status sync to one resumable page", async () => {
    const executed: { query: string; values: unknown[] }[] = [];
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return new Response(
        JSON.stringify({
          content: btoa("---\nstatus: published\n---\n"),
        }),
      );
    });
    try {
      await runScheduled("*/2 * * * *", {
        GITHUB_PUBLISH_TOKEN: "test-token",
        REPORTS: {
          prepare: (query: string) =>
            new SyncStatement(query, (statement, values) =>
              executed.push({ query: statement, values }),
            ),
        },
      });

      expect(requests).toHaveLength(8);
      expect(requests.every((url) => url.includes("/contents/"))).toBe(true);
      expect(
        executed.find((entry) =>
          entry.query.includes("admin_worker_sync_checkpoints"),
        )?.values,
      ).toEqual([
        "editorial-publication-status",
        "document-08",
        expect.any(String),
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("limits published article backup sync to one resumable page", async () => {
    const executed: { query: string; values: unknown[] }[] = [];
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url.includes("/git/trees/main?recursive=1"))
        return new Response(
          JSON.stringify({
            tree: Array.from({ length: 9 }, (_, index) => ({
              type: "blob",
              path: `src/content/articles/ja/math/overview/article-${index + 1}.md`,
              sha: `sha-${index + 1}`,
            })),
          }),
        );
      return new Response(
        JSON.stringify({
          content: btoa(`# Article\n\nBody`),
          encoding: "base64",
        }),
      );
    });
    try {
      await runScheduled("1-59/2 * * * *", {
        GITHUB_PUBLISH_TOKEN: "test-token",
        REPORTS: {
          prepare: (query: string) =>
            new SyncStatement(query, (statement, values) =>
              executed.push({ query: statement, values }),
            ),
        },
      });

      expect(requests).toHaveLength(9);
      expect(
        requests.filter((url) => url.includes("/git/trees/")),
      ).toHaveLength(1);
      expect(requests.some((url) => url.endsWith("/git/blobs/sha-1"))).toBe(
        true,
      );
      expect(
        executed
          .find((entry) =>
            entry.query.includes(
              "INSERT OR IGNORE INTO article_source_backups",
            ),
          )
          ?.values.slice(3, 6),
      ).toEqual(["sha-1", "# Article\n\nBody", "scheduled"]);
      expect(
        executed.find((entry) =>
          entry.query.includes("admin_worker_sync_checkpoints"),
        )?.values,
      ).toEqual([
        "published-article-backups",
        "src/content/articles/ja/math/overview/article-8.md",
        expect.any(String),
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    [
      "a non-success response",
      () => new Response("unavailable", { status: 503 }),
    ],
    ["a missing body", () => new Response(JSON.stringify({ sha: "sha-2" }))],
    [
      "an unsupported encoding",
      () =>
        new Response(
          JSON.stringify({ content: btoa("# Article"), encoding: "utf-8" }),
        ),
    ],
    [
      "a rejected request",
      () => {
        throw new Error("simulated provider detail");
      },
    ],
  ])(
    "does not advance the article backup checkpoint after %s",
    async (_failure, makeFailureResponse) => {
      const executed: { query: string; values: unknown[] }[] = [];
      let contentRequests = 0;
      vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/git/trees/main?recursive=1"))
          return new Response(
            JSON.stringify({
              tree: [
                {
                  type: "blob",
                  path: "src/content/articles/ja/math/overview/article-1.md",
                  sha: "sha-1",
                },
                {
                  type: "blob",
                  path: "src/content/articles/ja/math/overview/article-2.md",
                  sha: "sha-2",
                },
              ],
            }),
          );
        contentRequests += 1;
        if (contentRequests === 2) return makeFailureResponse();
        return new Response(
          JSON.stringify({ content: btoa("# Article"), encoding: "base64" }),
        );
      });
      try {
        await expect(
          runScheduled("1-59/2 * * * *", {
            GITHUB_PUBLISH_TOKEN: "test-token",
            REPORTS: {
              prepare: (query: string) =>
                new SyncStatement(query, (statement, values) =>
                  executed.push({ query: statement, values }),
                ),
            },
          }),
        ).rejects.toThrow("checkpointは進めていません");

        expect(
          executed.filter((entry) =>
            entry.query.includes(
              "INSERT OR IGNORE INTO article_source_backups",
            ),
          ),
        ).toHaveLength(1);
        expect(
          executed.some((entry) =>
            entry.query.includes("admin_worker_sync_checkpoints"),
          ),
        ).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it("backs up an empty article blob instead of treating it as missing", async () => {
    const executed: { query: string; values: unknown[] }[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/git/trees/main?recursive=1"))
        return new Response(
          JSON.stringify({
            tree: [
              {
                type: "blob",
                path: "src/content/articles/ja/math/overview/empty.md",
                sha: "empty-sha",
              },
            ],
          }),
        );
      return new Response(JSON.stringify({ content: "", encoding: "base64" }));
    });
    try {
      await runScheduled("1-59/2 * * * *", {
        GITHUB_PUBLISH_TOKEN: "test-token",
        REPORTS: {
          prepare: (query: string) =>
            new SyncStatement(query, (statement, values) =>
              executed.push({ query: statement, values }),
            ),
        },
      });

      expect(
        executed
          .find((entry) =>
            entry.query.includes(
              "INSERT OR IGNORE INTO article_source_backups",
            ),
          )
          ?.values.slice(3, 6),
      ).toEqual(["empty-sha", "", "scheduled"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
