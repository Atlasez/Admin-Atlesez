import { describe, expect, it } from "vitest";
import worker from "../../src/admin-worker";

class ReportsStatement {
  constructor(
    readonly query: string,
    private readonly db: ReportsDb,
  ) {}
  bind(...values: unknown[]) {
    this.db.bindings.push(values);
    return this;
  }
  async all<T>() {
    if (this.query.includes("FROM report_admin_permissions"))
      return { results: [{ subject: "mathematics" }] as T[] };
    if (this.query.includes("FROM article_reports"))
      return { results: this.db.reports as T[] };
    if (this.query.includes("FROM article_analytics_daily"))
      return { results: this.db.analytics as T[] };
    return { results: [] as T[] };
  }
  async first<T>() {
    return null as T | null;
  }
  async run() {
    return { meta: { changes: 1 } };
  }
}

class ReportsDb {
  readonly bindings: unknown[][] = [];
  readonly queries: string[] = [];
  readonly reports = [
    {
      id: "report-a",
      article_title: "A",
      article_url: "https://example.com/a",
      article_id: null,
      subject: "mathematics",
      category: "algebra",
      report_type: "error",
      details: "details",
      contact: "a@example.com",
      locale: "ja",
      status: "new",
      admin_note: "",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "report-b",
      article_title: "B",
      article_url: "https://example.com/b",
      article_id: null,
      subject: "physics",
      category: "mechanics",
      report_type: "suggestion",
      details: "details",
      contact: "b@example.com",
      locale: "ja",
      status: "new",
      admin_note: "",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];
  readonly analytics = [
    {
      article_id: "a",
      article_title: "A",
      subject: "mathematics",
      category: "algebra",
      views: 1,
      engaged_reads: 1,
      completed_reads: 1,
    },
    {
      article_id: "b",
      article_title: "B",
      subject: "physics",
      category: "mechanics",
      views: 2,
      engaged_reads: 2,
      completed_reads: 2,
    },
  ];
  prepare(query: string) {
    this.queries.push(query);
    return new ReportsStatement(query, this);
  }
  async batch() {
    return [];
  }
}

const request = (path: string, init: RequestInit = {}) =>
  new Request(`https://admin.example${path}`, {
    ...init,
    headers: {
      "Cf-Access-Authenticated-User-Email": "member@example.com",
      ...(init.headers ?? {}),
    },
  });

const env = (db: ReportsDb) => ({
  ADMIN_AUTH_MODE: "cloudflare-access",
  REPORTS: db,
  ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
});

describe("reports and statistics access", () => {
  it("allows a normal operator to read all subjects while preserving write scope", async () => {
    const db = new ReportsDb();
    const reports = await worker.fetch(
      request("/api/admin/article-reports"),
      env(db) as never,
    );
    expect(reports.status).toBe(200);
    const reportData = (await reports.json()) as {
      reports: Array<{
        subject: string;
        contact: string | null;
        can_manage: boolean;
      }>;
    };
    expect(reportData.reports.map((item) => item.subject)).toEqual([
      "mathematics",
      "physics",
    ]);
    expect(reportData.reports.map((item) => item.can_manage)).toEqual([
      true,
      false,
    ]);
    expect(reportData.reports.every((item) => item.contact === null)).toBe(
      true,
    );

    const analytics = await worker.fetch(
      request("/api/admin/article-analytics?days=30"),
      env(db) as never,
    );
    expect(analytics.status).toBe(200);
    expect((await analytics.json()).articles).toHaveLength(2);
    expect(
      db.queries.some(
        (query) =>
          query.includes("FROM article_analytics_daily") &&
          !query.includes("subject IN"),
      ),
    ).toBe(true);
  });

  it("returns 401 without an operator identity", async () => {
    const db = new ReportsDb();
    const response = await worker.fetch(
      new Request("https://admin.example/api/admin/article-analytics"),
      env(db) as never,
    );
    expect(response.status).toBe(401);
  });
});
