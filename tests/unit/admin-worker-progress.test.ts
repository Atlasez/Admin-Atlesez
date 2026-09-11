import { describe, expect, it } from "vitest";
import worker from "../../src/admin-worker";

type ProgressRow = {
  id: string;
  project_id: string;
  subject: string | null;
  document_id: string | null;
  body: string;
  created_at: string;
  email: string;
  display_name: string;
  project_name: string;
};

class Statement {
  constructor(
    private readonly query: string,
    private readonly db: ProgressDb,
  ) {}

  bind(...values: unknown[]) {
    this.db.bindings.push(values);
    return this;
  }

  async run() {
    return { meta: { changes: 1 } };
  }

  async first<T>() {
    if (this.query.includes("SELECT role FROM atlasez_project_memberships"))
      return { role: "member" } as T;
    return null as T | null;
  }

  async all<T>() {
    if (this.query.includes("SELECT subject FROM report_admin_permissions"))
      return { results: [{ subject: "mathematics" }] as T[] };
    if (
      this.query.includes("SELECT role, subject FROM editorial_workflow_roles")
    )
      return { results: [] as T[] };
    if (this.query.includes("FROM atlasez_projects p"))
      return {
        results: [
          {
            id: "atlas",
            slug: "atlas",
            name: "アトラス",
            description: "",
            role: "member",
          },
        ] as T[],
      };
    if (this.query.includes("FROM editorial_progress_reports")) {
      const rows = this.query.includes("r.created_at < ?")
        ? this.db.reports.slice(2)
        : this.db.reports;
      return { results: rows as T[] };
    }
    return { results: [] as T[] };
  }
}

class ProgressDb {
  readonly bindings: unknown[][] = [];
  readonly reports: ProgressRow[] = [
    {
      id: "report-3",
      project_id: "atlas",
      subject: "mathematics",
      document_id: null,
      body: "最新の報告",
      created_at: "2026-09-11T00:00:00.000Z",
      email: "member@example.com",
      display_name: "メンバー",
      project_name: "アトラス",
    },
    {
      id: "report-2",
      project_id: "atlas",
      subject: "mathematics",
      document_id: null,
      body: "前の報告",
      created_at: "2026-09-10T00:00:00.000Z",
      email: "member@example.com",
      display_name: "メンバー",
      project_name: "アトラス",
    },
    {
      id: "report-1",
      project_id: "atlas",
      subject: "mathematics",
      document_id: null,
      body: "さらに前の報告",
      created_at: "2026-09-09T00:00:00.000Z",
      email: "member@example.com",
      display_name: "メンバー",
      project_name: "アトラス",
    },
  ];

  prepare(query: string) {
    return new Statement(query, this);
  }

  async batch() {
    return [];
  }
}

const request = (path: string) =>
  new Request(`https://admin.example${path}`, {
    headers: { "Cf-Access-Authenticated-User-Email": "member@example.com" },
  });

const env = (db: ProgressDb) => ({
  ADMIN_AUTH_MODE: "cloudflare-access",
  REPORTS: db,
  ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
});

describe("progress report pagination", () => {
  it("limits the initial page and returns a stable cursor for the next page", async () => {
    const db = new ProgressDb();
    const firstResponse = await worker.fetch(
      request("/api/admin/progress?limit=2"),
      env(db) as never,
    );
    expect(firstResponse.status).toBe(200);
    const first = (await firstResponse.json()) as {
      progress: ProgressRow[];
      progressPagination: {
        limit: number;
        hasMore: boolean;
        nextCursor: string | null;
      };
    };
    expect(first.progress.map((row) => row.id)).toEqual([
      "report-3",
      "report-2",
    ]);
    expect(first.progressPagination.limit).toBe(2);
    expect(first.progressPagination.hasMore).toBe(true);
    expect(first.progressPagination.nextCursor).toBeTruthy();

    const nextResponse = await worker.fetch(
      request(
        `/api/admin/progress?limit=2&cursor=${first.progressPagination.nextCursor}`,
      ),
      env(db) as never,
    );
    expect(nextResponse.status).toBe(200);
    const next = (await nextResponse.json()) as {
      progress: ProgressRow[];
      progressPagination: {
        limit: number;
        hasMore: boolean;
        nextCursor: string | null;
      };
    };
    expect(next.progress.map((row) => row.id)).toEqual(["report-1"]);
    expect(next.progressPagination).toEqual({
      limit: 2,
      hasMore: false,
      nextCursor: null,
    });
  });
});
