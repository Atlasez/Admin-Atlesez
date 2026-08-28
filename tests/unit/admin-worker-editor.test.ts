import { describe, expect, it } from "vitest";
import worker from "../../src/admin-worker";

class EmptyStatement {
  constructor(private readonly query: string) {}

  bind(...values: unknown[]) {
    const placeholders = (this.query.match(/\?/g) ?? []).length;
    if (placeholders !== values.length)
      throw new Error(
        `Wrong number of parameter bindings: expected ${placeholders}, received ${values.length}`,
      );
    return this;
  }

  async all<T>() {
    return { results: [] as T[] };
  }

  async first<T>() {
    return null as T | null;
  }

  async run() {
    return {};
  }
}

const emptyEnv = {
  ADMIN_AUTH_MODE: "local",
  ADMIN_LOCAL_EMAIL: "local-editor@atlasez.test",
  REPORTS: {
    prepare: (query: string) => new EmptyStatement(query),
    batch: async () => [],
  },
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};

describe("admin worker editor APIs", () => {
  it("serves the CodeMirror completion module used by the article editor", async () => {
    let requestedPath = "";
    const assetEnv = {
      ...emptyEnv,
      ASSETS: {
        fetch: async (request: Request) => {
          requestedPath = new URL(request.url).pathname;
          return new Response("completion module", {
            status: 200,
            headers: { "content-type": "text/javascript" },
          });
        },
      },
    };
    const response = await worker.fetch(
      new Request("http://localhost/admin-codemirror.js"),
      assetEnv as never,
    );

    expect(response.status).toBe(200);
    expect(requestedPath).toBe("/admin-codemirror.js");
    await expect(response.text()).resolves.toContain("completion module");
  });

  it("returns JSON for unexpected API failures instead of a Cloudflare HTML error", async () => {
    const brokenEnv = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: () => {
          throw new Error("no such table: editorial_member_profiles");
        },
      },
    };
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/profile"),
      brokenEnv as never,
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    const data = (await response.json()) as {
      error?: string;
      requestId?: string;
    };
    expect(data.error).toContain("データを読み込めませんでした");
    expect(data.error).not.toContain("no such table");
    expect(data.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns empty review request collections for an all-subject manager", async () => {
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/editor/review-requests"),
      emptyEnv as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      requests: [],
      reviewers: [],
    });
  });

  it("serves an editorial asset with its saved MIME type and filename", async () => {
    const assetId = "11111111-1111-4111-8111-111111111111";
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const assetEnv = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => {
          const statement = new EmptyStatement(query);
          if (!query.includes("FROM editorial_assets a")) return statement;
          return Object.assign(statement, {
            first: async () => ({
              id: assetId,
              document_id: "22222222-2222-4222-8222-222222222222",
              filename: "diagram.png",
              media_type: "image/png",
              bytes: bytes.byteLength,
              data: bytes,
              subject: "mathematics",
              status: "draft",
            }),
          });
        },
      },
    };

    const response = await worker.fetch(
      new Request(`http://localhost/api/admin/editor/assets/${assetId}`),
      assetEnv as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="diagram.png"',
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("stores approved comment tags independently from the comment body", async () => {
    const executed: { query: string; values: unknown[] }[] = [];
    const collaborationNotifications: Request[] = [];
    class RecordingStatement extends EmptyStatement {
      private values: unknown[] = [];

      constructor(private readonly sql: string) {
        super(sql);
      }

      bind(...values: unknown[]) {
        super.bind(...values);
        this.values = values;
        return this;
      }

      async first<T>() {
        if (
          this.sql.includes("SELECT subject, status FROM editorial_documents")
        )
          return { subject: "mathematics", status: "draft" } as T;
        return null as T | null;
      }

      async run() {
        executed.push({ query: this.sql, values: this.values });
        return {};
      }
    }
    const env = {
      ...emptyEnv,
      EDITORIAL_COLLABORATION: {
        idFromName: () => ({}),
        get: () => ({
          fetch: async (request: Request) => {
            collaborationNotifications.push(request);
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          },
        }),
      },
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => new RecordingStatement(query),
      },
    };
    const response = await worker.fetch(
      new Request(
        "http://localhost/api/admin/editor/documents/22222222-2222-4222-8222-222222222222/comments",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost",
          },
          body: JSON.stringify({
            body: "定義を補足してください。",
            tags: ["定義不足", "例・図の追加"],
            selections: [],
          }),
        },
      ),
      env as never,
    );

    expect(response.status).toBe(201);
    const tagInserts = executed.filter((entry) =>
      entry.query.includes("INSERT INTO editorial_comment_tags"),
    );
    expect(tagInserts.map((entry) => entry.values.at(-1))).toEqual([
      "定義不足",
      "例・図の追加",
    ]);
    const commentInsert = executed.find((entry) =>
      entry.query.includes("INSERT INTO editorial_comments"),
    );
    expect(commentInsert?.values).toContain("定義を補足してください。");
    expect(commentInsert?.values).not.toContain("[定義不足]");
    expect(collaborationNotifications).toHaveLength(1);
    expect(collaborationNotifications[0]?.method).toBe("POST");
    await expect(collaborationNotifications[0]?.json()).resolves.toEqual({
      type: "comments-changed",
    });
  });

  it("accepts a tag-only comment while rejecting a completely empty comment", async () => {
    class CommentStatement extends EmptyStatement {
      constructor(private readonly sql: string) {
        super(sql);
      }

      async first<T>() {
        if (
          this.sql.includes("SELECT subject, status FROM editorial_documents")
        )
          return { subject: "mathematics", status: "draft" } as T;
        return null as T | null;
      }
    }
    const env = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => new CommentStatement(query),
      },
    };
    const request = (payload: unknown) =>
      new Request(
        "http://localhost/api/admin/editor/documents/22222222-2222-4222-8222-222222222222/comments",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost",
          },
          body: JSON.stringify(payload),
        },
      );

    const tagOnly = await worker.fetch(
      request({ body: "", tags: ["根拠確認"], selections: [] }),
      env as never,
    );
    expect(tagOnly.status).toBe(201);

    const empty = await worker.fetch(
      request({ body: "", tags: [], selections: [] }),
      env as never,
    );
    expect(empty.status).toBe(400);
  });

  it("rejects comment tags outside the supported review taxonomy", async () => {
    const response = await worker.fetch(
      new Request(
        "http://localhost/api/admin/editor/documents/22222222-2222-4222-8222-222222222222/comments",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost",
          },
          body: JSON.stringify({
            body: "確認してください。",
            tags: ["任意タグ"],
          }),
        },
      ),
      emptyEnv as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "選択できないコメントタグが含まれています。",
    });
  });
});
