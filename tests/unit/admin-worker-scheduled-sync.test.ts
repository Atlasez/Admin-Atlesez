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
          sha: "content-sha",
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
});
