import { readFile } from "node:fs/promises";
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
    if (
      this.query.includes("INSERT OR IGNORE INTO editorial_progress_reactions")
    ) {
      const [id, reportId, actorEmail, reaction, createdAt] =
        this.db.bindings.at(-1) ?? [];
      if (
        !this.db.reactions.some(
          (item) =>
            item.progress_id === reportId &&
            item.actor_email === actorEmail &&
            item.reaction === reaction,
        )
      )
        this.db.reactions.push({
          id: String(id),
          progress_id: String(reportId),
          actor_email: String(actorEmail),
          reaction: String(reaction),
          created_at: String(createdAt),
        });
    }
    if (this.query.includes("DELETE FROM editorial_progress_reactions")) {
      const [reportId, actorEmail] = this.db.bindings.at(-1) ?? [];
      this.db.reactions = this.db.reactions.filter(
        (item) =>
          item.progress_id !== reportId || item.actor_email !== actorEmail,
      );
    }
    return { meta: { changes: 1 } };
  }

  async first<T>() {
    if (this.query.includes("SELECT role FROM atlasez_project_memberships"))
      return { role: "member" } as T;
    if (this.query.includes("SELECT r.id FROM editorial_progress_reports")) {
      const reportId = this.db.bindings.at(-1)?.[0];
      const report = this.db.reports.find((item) => item.id === reportId);
      return report ? ({ id: report.id } as T) : (null as T | null);
    }
    if (this.query.includes("SELECT COUNT(*) AS reaction_count")) {
      const [reportId, actorEmail] = this.db.bindings.at(-1) ?? [];
      const reactions = this.db.reactions.filter(
        (item) => item.progress_id === reportId && item.reaction === "like",
      );
      return {
        reaction_count: reactions.length,
        reacted_by_me: Number(
          reactions.some(
            (item) =>
              item.actor_email === actorEmail && item.reaction === "like",
          ),
        ),
      } as T;
    }
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
      return {
        results: rows.map((row) => ({
          ...row,
          reaction_count: this.db.reactions.filter(
            (item) => item.progress_id === row.id && item.reaction === "like",
          ).length,
          reacted_by_me: Number(
            this.db.reactions.some(
              (item) =>
                item.progress_id === row.id &&
                item.actor_email === this.db.bindings[0]?.[0] &&
                item.reaction === "like",
            ),
          ),
        })) as T[],
      };
    }
    return { results: [] as T[] };
  }
}

class ProgressDb {
  readonly bindings: unknown[][] = [];
  readonly queries: string[] = [];
  reactions: {
    id: string;
    progress_id: string;
    actor_email: string;
    reaction: string;
    created_at: string;
  }[] = [];
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
    this.queries.push(query);
    return new Statement(query, this);
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
      ...(init.headers as Record<string, string> | undefined),
    },
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
      progress: (ProgressRow & {
        reaction_count: number;
        reacted_by_me: number;
      })[];
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
    expect(first.progress[0]).toMatchObject({
      reaction_count: 0,
      reacted_by_me: 0,
    });

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

  it("lets an authorized member add and remove their own reaction", async () => {
    const db = new ProgressDb();
    const react = (reacted: boolean) =>
      worker.fetch(
        request("/api/admin/progress/report-3/reaction", {
          method: "PUT",
          headers: {
            "Cf-Access-Authenticated-User-Email": "Member@Example.com",
            origin: "https://admin.example",
            "content-type": "application/json",
          },
          body: JSON.stringify({ reacted }),
        }),
        env(db) as never,
      );

    const addedResponse = await react(true);
    expect(addedResponse.status).toBe(200);
    expect(await addedResponse.json()).toMatchObject({
      reactionCount: 1,
      reactedByMe: true,
    });
    expect(db.reactions).toHaveLength(1);
    expect(db.reactions[0]).toMatchObject({
      progress_id: "report-3",
      actor_email: "member@example.com",
      reaction: "like",
    });
    expect(db.reactions[0].id).toBeTruthy();
    expect(db.queries.join("\n")).toContain("progress_id");
    expect(db.queries.join("\n")).not.toContain("report_id");

    const duplicateResponse = await react(true);
    expect(duplicateResponse.status).toBe(200);
    expect(await duplicateResponse.json()).toMatchObject({
      reactionCount: 1,
      reactedByMe: true,
    });
    expect(db.reactions).toHaveLength(1);

    const removedResponse = await react(false);
    expect(removedResponse.status).toBe(200);
    expect(await removedResponse.json()).toMatchObject({
      reactionCount: 0,
      reactedByMe: false,
    });
    expect(db.reactions).toHaveLength(0);
  });

  it("matches the existing editorial progress reaction schema", async () => {
    const migration = await readFile(
      new URL(
        "../../migrations/0116_editorial_progress_reactions.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migration).toContain("progress_id TEXT NOT NULL");
    expect(migration).toContain("id TEXT PRIMARY KEY");
    expect(migration).toContain("reaction TEXT NOT NULL DEFAULT 'like'");
    expect(migration).toContain("UNIQUE(progress_id, actor_email, reaction)");
    expect(migration).not.toContain("report_id");
  });

  it("does not allow reacting to a report outside the visible report set", async () => {
    const db = new ProgressDb();
    const response = await worker.fetch(
      request("/api/admin/progress/not-visible/reaction", {
        method: "PUT",
        headers: {
          "Cf-Access-Authenticated-User-Email": "member@example.com",
          origin: "https://admin.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ reacted: true }),
      }),
      env(db) as never,
    );
    expect(response.status).toBe(404);
    expect(db.reactions).toHaveLength(0);
  });
});
