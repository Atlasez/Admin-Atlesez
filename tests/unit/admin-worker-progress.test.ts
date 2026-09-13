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
  private values: unknown[] = [];

  constructor(
    private readonly query: string,
    private readonly db: ProgressDb,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    this.db.bindings.push(values);
    return this;
  }

  async run() {
    if (this.query.includes("DELETE FROM editorial_progress_reactions")) {
      const [progressId, actorEmail] = this.values.map(String);
      this.db.reactions = this.db.reactions.filter(
        (reaction) =>
          !(
            reaction.progress_id === progressId &&
            reaction.actor_email.toLowerCase() === actorEmail.toLowerCase()
          ),
      );
    }
    if (
      this.query.includes("INSERT") &&
      this.query.includes("editorial_progress_reactions")
    ) {
      const [id, progressId, actorEmail, createdAt] = this.values.map(String);
      if (
        !this.db.reactions.some(
          (reaction) =>
            reaction.progress_id === progressId &&
            reaction.actor_email.toLowerCase() === actorEmail.toLowerCase(),
        )
      ) {
        this.db.reactions.push({
          id,
          progress_id: progressId,
          actor_email: actorEmail,
          created_at: createdAt,
        });
      }
    }
    return { meta: { changes: 1 } };
  }

  async first<T>() {
    if (this.query.includes("SELECT role FROM atlasez_project_memberships"))
      return { role: "member" } as T;
    if (
      this.query.includes(
        "SELECT id,project_id,subject,email FROM editorial_progress_reports",
      )
    ) {
      const report = this.db.reports.find(
        (item) => item.id === String(this.values[0]),
      );
      return report ? (report as T) : (null as T | null);
    }
    if (this.query.includes("SELECT id FROM editorial_progress_reactions")) {
      const [progressId, actorEmail] = this.values.map(String);
      const reaction = this.db.reactions.find(
        (item) =>
          item.progress_id === progressId &&
          item.actor_email.toLowerCase() === actorEmail.toLowerCase(),
      );
      return reaction ? ({ id: reaction.id } as T) : (null as T | null);
    }
    if (
      this.query.includes(
        "SELECT COUNT(*) AS like_count FROM editorial_progress_reactions",
      )
    ) {
      const progressId = String(this.values[0]);
      return {
        like_count: this.db.reactions.filter(
          (item) => item.progress_id === progressId,
        ).length,
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
    if (this.query.includes("FROM editorial_progress_reactions")) {
      const actorEmail = String(this.values[0] ?? "");
      const ids = this.values.slice(1).map(String);
      const results = ids.flatMap((progressId) => {
        const reactions = this.db.reactions.filter(
          (item) => item.progress_id === progressId,
        );
        return reactions.length
          ? [
              {
                progress_id: progressId,
                like_count: reactions.length,
                liked_by_me: reactions.some(
                  (item) =>
                    item.actor_email.toLowerCase() === actorEmail.toLowerCase(),
                )
                  ? 1
                  : 0,
              },
            ]
          : [];
      });
      return { results: results as T[] };
    }
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
  reactions: Array<{
    id: string;
    progress_id: string;
    actor_email: string;
    created_at: string;
  }> = [];
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

describe("progress report likes", () => {
  it("toggles one reaction, returns the count, and exposes only the current user's state", async () => {
    const db = new ProgressDb();
    const progressId = "11111111-1111-4111-8111-111111111111";
    db.reports[0].id = progressId;
    db.reactions.push({
      id: "existing-like",
      progress_id: progressId,
      actor_email: "other@example.com",
      created_at: "2026-09-11T00:00:00.000Z",
    });

    const likeResponse = await worker.fetch(
      new Request(
        `https://admin.example/api/admin/progress/${progressId}/reaction`,
        {
          method: "POST",
          headers: {
            "Cf-Access-Authenticated-User-Email": "member@example.com",
            "content-type": "application/json",
          },
          body: JSON.stringify({ action: "like" }),
        },
      ),
      env(db) as never,
    );
    expect(likeResponse.status).toBe(200);
    expect(await likeResponse.json()).toMatchObject({
      liked: true,
      likeCount: 2,
    });

    const overviewResponse = await worker.fetch(
      request("/api/admin/progress?limit=1"),
      env(db) as never,
    );
    const overview = (await overviewResponse.json()) as {
      progress: Array<{ like_count: number; liked_by_me: boolean }>;
    };
    expect(overview.progress[0]).toMatchObject({
      like_count: 2,
      liked_by_me: true,
    });

    const unlikeResponse = await worker.fetch(
      new Request(
        `https://admin.example/api/admin/progress/${progressId}/reaction`,
        {
          method: "POST",
          headers: {
            "Cf-Access-Authenticated-User-Email": "member@example.com",
            "content-type": "application/json",
          },
          body: JSON.stringify({ action: "like" }),
        },
      ),
      env(db) as never,
    );
    expect(await unlikeResponse.json()).toMatchObject({
      liked: false,
      likeCount: 1,
    });
    expect(db.reactions).toHaveLength(1);
  });

  it("rejects a like from a member outside the report's subject scope", async () => {
    const db = new ProgressDb();
    const progressId = "22222222-2222-4222-8222-222222222222";
    db.reports[0].id = progressId;
    db.reports[0].subject = "physics";
    const response = await worker.fetch(
      new Request(
        `https://admin.example/api/admin/progress/${progressId}/reaction`,
        {
          method: "POST",
          headers: {
            "Cf-Access-Authenticated-User-Email": "other@example.com",
            "content-type": "application/json",
          },
          body: JSON.stringify({ action: "like" }),
        },
      ),
      env(db) as never,
    );
    expect(response.status).toBe(403);
    expect(db.reactions).toHaveLength(0);
  });

  it("makes explicit set requests idempotent and supports an explicit cancellation", async () => {
    const db = new ProgressDb();
    const progressId = "33333333-3333-4333-8333-333333333333";
    db.reports[0].id = progressId;
    const set = (liked: boolean) =>
      worker.fetch(
        new Request(
          `https://admin.example/api/admin/progress/${progressId}/reaction`,
          {
            method: "POST",
            headers: {
              "Cf-Access-Authenticated-User-Email": "member@example.com",
              "content-type": "application/json",
            },
            body: JSON.stringify({ action: "set", liked }),
          },
        ),
        env(db) as never,
      );

    await expect(
      set(true).then((response) => response.json()),
    ).resolves.toMatchObject({
      liked: true,
      likeCount: 1,
    });
    await expect(
      set(true).then((response) => response.json()),
    ).resolves.toMatchObject({
      liked: true,
      likeCount: 1,
    });
    await expect(
      set(false).then((response) => response.json()),
    ).resolves.toMatchObject({
      liked: false,
      likeCount: 0,
    });
    expect(db.reactions).toHaveLength(0);
  });
});
