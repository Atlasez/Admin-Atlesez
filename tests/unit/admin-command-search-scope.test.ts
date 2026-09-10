import { describe, expect, it } from "vitest";
import worker from "../../src/admin-worker";

class Statement {
  constructor(
    readonly query: string,
    readonly db: ReportsDb,
  ) {}

  bind(...values: unknown[]) {
    this.db.bindings.push({ query: this.query, values });
    return this;
  }

  async all<T>() {
    if (this.query.includes("SELECT subject FROM report_admin_permissions"))
      return { results: [{ subject: "mathematics" }] as T[] };
    if (this.query.includes("FROM editorial_workflow_roles"))
      return { results: [] as T[] };
    if (this.query.includes("FROM editorial_documents"))
      return {
        results: [
          {
            id: "math-doc",
            title: "群の定義",
            summary: "数学の記事",
            status: "draft",
            subject: "mathematics",
            updated_at: "2026-09-10T00:00:00.000Z",
          },
          {
            id: "physics-doc",
            title: "力学",
            summary: "物理の記事",
            status: "draft",
            subject: "physics",
            updated_at: "2026-09-09T00:00:00.000Z",
          },
        ].filter((row) =>
          this.query.includes("subject IN (?)")
            ? row.subject === "mathematics"
            : true,
        ) as T[],
      };
    return { results: [] as T[] };
  }

  async first<T>() {
    return null as T | null;
  }
}

class ReportsDb {
  readonly bindings: Array<{ query: string; values: unknown[] }> = [];

  prepare(query: string) {
    return new Statement(query, this);
  }

  async batch() {
    return [];
  }
}

describe("admin command search scope", () => {
  it("does not return another subject's article for a scoped operator", async () => {
    const db = new ReportsDb();
    const response = await worker.fetch(
      new Request(
        "https://admin.example/api/admin/command-search?q=%E5%8A%9B%E5%AD%A6",
        {
          headers: {
            "Cf-Access-Authenticated-User-Email": "member@example.com",
          },
        },
      ),
      {
        ADMIN_AUTH_MODE: "cloudflare-access",
        REPORTS: db,
        ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
      } as never,
    );

    expect(response.status).toBe(200);
    expect((await response.json()).results).toEqual([
      expect.objectContaining({ title: "群の定義" }),
    ]);
    const documentQuery = db.bindings.find(({ query }) =>
      query.includes("FROM editorial_documents"),
    );
    expect(documentQuery?.query).toContain("subject IN (?)");
    expect(documentQuery?.values).toEqual([
      "member@example.com",
      "mathematics",
      "%力学%",
      "%力学%",
    ]);
  });
});
