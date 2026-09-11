import { describe, expect, it, vi } from "vitest";
import worker, {
  editorialOutlineAutoSlug,
  mergeEditorialTaxonomyYaml,
  scheduledPublicationEpoch,
} from "../../src/admin-worker";

class EmptyStatement {
  constructor(protected readonly query: string) {}

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

const githubWebhookSignature = async (secret: string, body: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  return `sha256=${[...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
};

describe("admin worker editor APIs", () => {
  it("derives stable outline slugs from article titles", () => {
    expect(
      editorialOutlineAutoSlug("Concentration Inequalities", "fallback"),
    ).toBe("outline-concentration-inequalities");
    expect(editorialOutlineAutoSlug("集中不等式", "fallback")).toMatch(
      /^outline-[a-z0-9-]+$/,
    );
  });

  it("merges a dynamic subject and category into the learning-site catalog", () => {
    const yaml = [
      "- id: mathematics",
      "  slug: mathematics",
      "  name: { ja: 数学, en: Mathematics }",
      "  status: published",
      "  order: 1",
      "  group: natural",
      "  genre: mathematics-information",
      "  description: { ja: 数学, en: Mathematics }",
      "  categories:",
      "    - id: group-theory",
      "      slug: group-theory",
      "      name: { ja: 群論, en: Group Theory }",
      "      order: 1",
      "      entryConceptIds: []",
      "      relatedCategoryIds: []",
      "- id: physics",
      "  slug: physics",
      "  name: { ja: 物理, en: Physics }",
      "  status: published",
    ].join("\n");
    const rows = [
      {
        kind: "subject" as const,
        subject_slug: "",
        slug: "informatics",
        name: "情報",
        description: "情報科学を体系的に学ぶ",
        sort_order: 20,
      },
      {
        kind: "category" as const,
        subject_slug: "informatics",
        slug: "machine-learning",
        name: "機械学習",
        description: "",
        sort_order: 0,
      },
    ];
    const merged = mergeEditorialTaxonomyYaml(yaml, rows, "informatics");
    expect(merged).toContain("- id: informatics");
    expect(merged).toContain('name: { ja: "機械学習", en: "機械学習" }');
    expect(merged).toContain("entryConceptIds: []");
    expect(merged.indexOf("- id: informatics")).toBeGreaterThan(
      merged.indexOf("- id: physics"),
    );
  });

  it("adds a dynamic category to an existing learning-site subject only once", () => {
    const yaml = [
      "- id: mathematics",
      "  slug: mathematics",
      "  name: { ja: 数学, en: Mathematics }",
      "  categories:",
      "    - id: group-theory",
      "      slug: group-theory",
    ].join("\n");
    const row = {
      kind: "category" as const,
      subject_slug: "mathematics",
      slug: "machine-learning",
      name: "機械学習",
      description: "",
      sort_order: 9,
    };
    const once = mergeEditorialTaxonomyYaml(yaml, [row], "mathematics");
    const twice = mergeEditorialTaxonomyYaml(once, [row], "mathematics");
    expect(twice).toBe(once);
    expect((twice.match(/id: machine-learning/g) ?? []).length).toBe(1);
  });

  it("returns the numeric pending approval count in the portal overview", async () => {
    const portalEnv = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => {
          const statement = new EmptyStatement(query);
          statement.first = async <T>() => {
            if (query.includes("editorial_member_profile_change_requests"))
              return { count: 2 } as T;
            if (query.includes("editorial_project_profile_change_requests"))
              return { count: 1 } as T;
            return null;
          };
          return statement;
        },
      },
    };
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/portal"),
      portalEnv as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      pendingApprovals: 3,
    });
  });

  it("returns publication runs ordered by operator attention with scoped metadata", async () => {
    const queries: string[] = [];
    const run = {
      id: "run-1",
      document_id: "document-1",
      action: "publish",
      state: "failed",
      attempt: 2,
      title: "テスト記事",
      subject: "mathematics",
      category: "group-theory",
      slug: "cyclic-groups",
      document_status: "draft",
      published_at: null,
      updated_at: "2026-09-12T00:00:00.000Z",
      failure_kind: "github_api",
      failure_step: "checks",
      failure_file: null,
      failure_line: null,
      failure_suggestion: "CIログを確認して再試行してください。",
      check_url: "https://github.com/example/checks/1",
      diagnostic_url: "https://admin.example.test/diagnostics/1",
      pull_request_url: "https://github.com/example/pull/1",
    };
    const publicationEnv = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => {
          queries.push(query);
          const statement = new EmptyStatement(query);
          statement.all = async <T>() => {
            if (query.includes("GROUP BY r.state"))
              return { results: [{ state: "failed", count: 1 }] } as {
                results: T[];
              };
            return { results: [run] } as { results: T[] };
          };
          return statement;
        },
      },
    };

    const response = await worker.fetch(
      new Request(
        "http://localhost/api/admin/editor/publication-runs?limit=10",
      ),
      publicationEnv as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runs: [run],
      counts: { failed: 1 },
      scope: { isManager: true },
    });
    expect(queries.some((query) => query.includes("ORDER BY CASE"))).toBe(true);
    expect(queries.every((query) => !query.includes("LIMIT 100"))).toBe(true);
  });

  it("creates user-defined taxonomy entries without requiring an internal slug", async () => {
    const subjectResponse = await worker.fetch(
      new Request("http://localhost/api/admin/editor/taxonomy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "subject",
          name: "データサイエンス",
          description: "情報分野",
        }),
      }),
      emptyEnv as never,
    );

    expect(subjectResponse.status).toBe(201);
    const subject = (await subjectResponse.json()) as {
      kind: string;
      slug: string;
      name: string;
    };
    expect(subject).toMatchObject({
      kind: "subject",
      name: "データサイエンス",
    });
    expect(subject.slug).toMatch(/^subject-[a-z0-9-]+$/);

    const taxonomyEnv = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => {
          const statement = new EmptyStatement(query);
          statement.first = async <T>() =>
            query.includes("kind='subject'") ? ({ id: "subject" } as T) : null;
          return statement;
        },
      },
    };
    const categoryResponse = await worker.fetch(
      new Request("http://localhost/api/admin/editor/taxonomy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "category",
          subject: subject.slug,
          name: "機械学習",
        }),
      }),
      taxonomyEnv as never,
    );

    expect(categoryResponse.status).toBe(201);
    const category = (await categoryResponse.json()) as {
      kind: string;
      subject: string;
      slug: string;
      name: string;
    };
    expect(category).toMatchObject({
      kind: "category",
      subject: subject.slug,
      name: "機械学習",
    });
    expect(category.slug).toMatch(/^category-[a-z0-9-]+$/);
  });

  it("reorders outline entries only inside the caller's permitted subjects", async () => {
    const outlineId = "00000000-0000-0000-0000-000000000001";
    const queries: string[] = [];
    const batches: unknown[][] = [];
    const outlineEnv = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => {
          queries.push(query);
          const statement = new EmptyStatement(query);
          statement.all = async <T>() =>
            ({
              results: [
                {
                  id: outlineId,
                  subject_slug: "mathematics",
                  title: "群の定義",
                },
              ],
            }) as { results: T[] };
          return statement;
        },
        batch: async (statements: unknown[]) => {
          batches.push(statements);
          return [];
        },
      },
    };
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/editor/outline", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "reorder",
          items: [{ id: outlineId, sortOrder: 20 }],
        }),
      }),
      outlineEnv as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      updated: 1,
    });
    expect(queries.some((query) => query.includes("id IN (?)"))).toBe(true);
    expect(batches).toHaveLength(1);
  });

  it("counts pending project profile approvals across projects", async () => {
    const queries: string[] = [];
    const portalEnv = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => {
          queries.push(query);
          const statement = new EmptyStatement(query);
          statement.first = async <T>() => {
            if (query.includes("editorial_member_profile_change_requests"))
              return { count: 0 } as T;
            if (query.includes("editorial_project_profile_change_requests"))
              return { count: 2 } as T;
            return null as T | null;
          };
          return statement;
        },
      },
    };

    const response = await worker.fetch(
      new Request("http://localhost/api/admin/portal"),
      portalEnv as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      pendingApprovals: 2,
    });
    expect(
      queries.find((query) =>
        query.includes("editorial_project_profile_change_requests"),
      ),
    ).not.toContain("project_id='atlas'");
  });

  it("uses the shared pending approval count in the action center", async () => {
    const actionCenterEnv = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => {
          const statement = new EmptyStatement(query);
          statement.first = async <T>() => {
            if (query.includes("editorial_member_profile_change_requests"))
              return { count: 2 } as T;
            if (query.includes("editorial_project_profile_change_requests"))
              return { count: 3 } as T;
            return null as T | null;
          };
          return statement;
        },
      },
    };

    const response = await worker.fetch(
      new Request("http://localhost/api/admin/action-center"),
      actionCenterEnv as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      counts: { approvals: 5 },
    });
  });

  it("uses the shared task summary for action-center due counts", async () => {
    const actionCenterEnv = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => {
          const statement = new EmptyStatement(query);
          statement.all = async <T>() => {
            if (query.includes("SELECT id,slug,name FROM atlasez_projects")) {
              return {
                results: [{ id: "atlas", slug: "atlas", name: "アトラス" }],
              } as { results: T[] };
            }
            return { results: [] as T[] };
          };
          statement.first = async <T>() => {
            if (query.includes("SELECT COUNT(*) AS open_count")) {
              return { open_count: 18, due_today: 4, due_soon: 7 } as T;
            }
            return null as T | null;
          };
          return statement;
        },
      },
    };

    const response = await worker.fetch(
      new Request("http://localhost/api/admin/action-center"),
      actionCenterEnv as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      counts: { today: 4, dueSoon: 7 },
    });
  });

  it("loads action-center history queries only for the history view", async () => {
    const actionQueries: string[] = [];
    const actionEnv = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => {
          actionQueries.push(query);
          return new EmptyStatement(query);
        },
      },
    };
    const actionResponse = await worker.fetch(
      new Request("http://localhost/api/admin/action-center"),
      actionEnv as never,
    );
    expect(actionResponse.status).toBe(200);
    await expect(actionResponse.json()).resolves.toMatchObject({
      view: "action",
    });
    expect(
      actionQueries.some((query) =>
        query.includes("t.status='done' OR t.archived_at IS NOT NULL"),
      ),
    ).toBe(false);
    expect(
      actionQueries.some((query) =>
        query.includes(
          "d.archived_at IS NOT NULL OR d.published_at IS NOT NULL",
        ),
      ),
    ).toBe(false);

    const historyQueries: string[] = [];
    const historyEnv = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => {
          historyQueries.push(query);
          return new EmptyStatement(query);
        },
      },
    };
    const historyResponse = await worker.fetch(
      new Request("http://localhost/api/admin/action-center?view=history"),
      historyEnv as never,
    );
    expect(historyResponse.status).toBe(200);
    await expect(historyResponse.json()).resolves.toMatchObject({
      view: "history",
    });
    expect(
      historyQueries.some((query) =>
        query.includes("t.status='done' OR t.archived_at IS NOT NULL"),
      ),
    ).toBe(true);
    expect(
      historyQueries.some((query) =>
        query.includes(
          "d.archived_at IS NOT NULL OR d.published_at IS NOT NULL",
        ),
      ),
    ).toBe(true);
  });

  it("limits active action-center articles to states that require work", async () => {
    let documentQuery = "";
    let documentBindings: unknown[] = [];
    const actionEnv = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => {
          const statement = new EmptyStatement(query);
          const originalBind = statement.bind.bind(statement);
          statement.bind = (...values: unknown[]) => {
            if (
              query.includes("d.scheduled_publish_at") &&
              query.includes("COALESCE(d.category")
            ) {
              documentQuery = query;
              documentBindings = values;
            }
            return originalBind(...values);
          };
          return statement;
        },
      },
    };

    const response = await worker.fetch(
      new Request("http://localhost/api/admin/action-center"),
      actionEnv as never,
    );

    expect(response.status).toBe(200);
    expect(documentQuery).toContain("d.status = 'draft'");
    expect(documentQuery).toContain("d.status = 'in-review'");
    expect(documentQuery).toContain("d.publication_review_stage IS NOT NULL");
    expect(documentBindings).toContain("local-editor@atlasez.test");
  });

  it("uses bounded cursor pages for profile change requests", async () => {
    const queries: string[] = [];
    const bindings: unknown[][] = [];
    class CursorStatement extends EmptyStatement {
      bind(...values: unknown[]) {
        bindings.push(values);
        return super.bind(...values);
      }
    }
    const profileEnv = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => {
          queries.push(query);
          return new CursorStatement(query);
        },
      },
    };

    const firstPage = await worker.fetch(
      new Request(
        "http://localhost/api/admin/profile-change-requests?status=all&limit=50",
      ),
      profileEnv as never,
    );
    expect(firstPage.status).toBe(200);
    expect(
      queries.filter((query) =>
        query.includes("editorial_member_profile_change_requests"),
      )[0],
    ).toContain("LIMIT ?");
    expect(
      queries.filter((query) =>
        query.includes("editorial_project_profile_change_requests"),
      )[0],
    ).toContain("LIMIT ?");
    expect(bindings.filter((values) => values.length === 1)).toHaveLength(2);
    expect(
      bindings
        .filter((values) => values.length === 1)
        .every(([limit]) => limit === 51),
    ).toBe(true);

    queries.length = 0;
    bindings.length = 0;
    const nextPage = await worker.fetch(
      new Request(
        "http://localhost/api/admin/profile-change-requests?status=all&limit=50&cursor=0%7C2026-01-01T00%3A00%3A00.000Z%7C00000000-0000-0000-0000-000000000001",
      ),
      profileEnv as never,
    );
    expect(nextPage.status).toBe(200);
    expect(
      queries.some(
        (query) =>
          query.includes("r.submitted_at < ?") && query.includes("LIMIT ?"),
      ),
    ).toBe(true);
    expect(
      bindings.some((values) => values.length === 6 && values.at(-1) === 51),
    ).toBe(true);
  });

  it("interprets datetime-local publication schedules as Japan time", () => {
    expect(scheduledPublicationEpoch("2026-09-01T12:00")).toBe(
      Date.parse("2026-09-01T03:00:00.000Z"),
    );
    expect(scheduledPublicationEpoch("2026-09-01T12:00+09:00")).toBe(
      Date.parse("2026-09-01T03:00:00.000Z"),
    );
  });

  it("syncs only the requested document when publication status is refreshed", async () => {
    const queries: string[] = [];
    const bindings: unknown[][] = [];
    const document = {
      id: "document-1",
      locale: "ja",
      subject: "mathematics",
      category: "group-theory",
      slug: "cyclic-groups",
      published_at: null,
      publication_action: null,
    };
    const publicationEnv = {
      ...emptyEnv,
      GITHUB_PUBLISH_TOKEN: "test-token",
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => {
          queries.push(query);
          return {
            bind: (...values: unknown[]) => {
              bindings.push(values);
              return {
                all: async <T>() =>
                  ({ results: [document] }) as { results: T[] },
                run: async () => ({}),
              };
            },
          };
        },
      },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(new URL(input.toString()).pathname).toBe(
        "/repos/Atlasez/Atlasez01/contents/src/content/articles/jpn/mathematics/group-theory/cyclic-groups.md",
      );
      return new Response(
        JSON.stringify({ content: "LS0tCnN0YXR1czogcHVibGlzaGVkCi0tLQo=" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const response = await worker.fetch(
        new Request(
          "http://localhost/api/admin/editor/sync-publication-status?documentId=document-1",
          { method: "POST" },
        ),
        publicationEnv as never,
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        published: 1,
        pending: 0,
        total: 1,
      });
      expect(queries[0]).toContain("FROM editorial_documents WHERE id = ?");
      expect(bindings[0]).toEqual(["document-1"]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects unsigned GitHub publication webhooks", async () => {
    const response = await worker.fetch(
      new Request("http://localhost/api/internal/github-publication-webhook", {
        method: "POST",
        headers: { "x-github-event": "check_run" },
        body: JSON.stringify({ action: "completed" }),
      }),
      { ...emptyEnv, GITHUB_WEBHOOK_SECRET: "test-secret" } as never,
    );

    expect(response.status).toBe(401);
  });

  it("accepts a signed GitHub webhook and limits progress to the matching PR", async () => {
    const body = JSON.stringify({
      action: "completed",
      repository: { full_name: "Atlasez/Atlasez01" },
      check_run: {
        head_sha: "abc123",
        check_suite: { pull_requests: [{ number: 104 }] },
      },
    });
    const queries: string[] = [];
    const env = {
      ...emptyEnv,
      GITHUB_WEBHOOK_SECRET: "test-secret",
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => {
          queries.push(query);
          return new EmptyStatement(query);
        },
      },
    };
    const response = await worker.fetch(
      new Request("http://localhost/api/internal/github-publication-webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-event": "check_run",
          "x-hub-signature-256": await githubWebhookSignature(
            "test-secret",
            body,
          ),
        },
        body,
      }),
      env as never,
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      event: "check_run",
      processed: 0,
    });
    expect(
      queries.some((query) => query.includes("pull_request_number = ?")),
    ).toBe(true);
  });

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

  it("serves the operations guide screen captures", async () => {
    let requestedPath = "";
    const assetEnv = {
      ...emptyEnv,
      ASSETS: {
        fetch: async (request: Request) => {
          requestedPath = new URL(request.url).pathname;
          return new Response("png image", {
            status: 200,
            headers: { "content-type": "image/png" },
          });
        },
      },
    };
    const response = await worker.fetch(
      new Request("http://localhost/admin-guide/portal.png"),
      assetEnv as never,
    );

    expect(response.status).toBe(200);
    expect(requestedPath).toBe("/admin-guide/portal.png");
    await expect(response.text()).resolves.toBe("png image");
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

  it("loads only the selected review request with the scoped binding order", async () => {
    let documentQuery = "";
    let documentBindings: unknown[] = [];
    class ScopedStatement extends EmptyStatement {
      bind(...values: unknown[]) {
        if (this.query.includes("FROM editorial_documents d")) {
          documentQuery = this.query;
          documentBindings = values;
        }
        return super.bind(...values);
      }

      async all<T>() {
        if (this.query.includes("SELECT subject FROM report_admin_permissions"))
          return { results: [{ subject: "mathematics" }] as T[] };
        if (
          this.query.includes(
            "SELECT role, subject FROM editorial_workflow_roles",
          )
        )
          return { results: [] as T[] };
        if (this.query.includes("FROM editorial_documents d"))
          return {
            results: [
              {
                id: "doc-1",
                subject: "mathematics",
                category: "algebra",
                title: "原稿",
                updated_by: "member@example.com",
                updated_at: "2026-09-10T00:00:00.000Z",
                reviewer_email: "reviewer@example.com",
                request_note: "確認してください",
                requester_display_name: "作成者",
                reviewer_display_name: "担当者",
              },
            ] as T[],
          };
        if (this.query.includes("FROM report_admin_permissions p"))
          return {
            results: [
              {
                email: "reviewer@example.com",
                display_name: "担当者",
                subjects: "mathematics",
              },
            ] as T[],
          };
        return { results: [] as T[] };
      }
    }

    const response = await worker.fetch(
      new Request(
        "http://admin.example/api/admin/editor/review-requests?documentId=doc-1",
        {
          headers: {
            "Cf-Access-Authenticated-User-Email": "member@example.com",
          },
        },
      ),
      {
        ...emptyEnv,
        ADMIN_AUTH_MODE: "cloudflare-access",
        REPORTS: {
          ...emptyEnv.REPORTS,
          prepare: (query: string) => new ScopedStatement(query),
        },
      } as never,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      requests: Array<{ id: string; reviewer_email: string }>;
    };
    expect(data.requests).toHaveLength(1);
    expect(data.requests[0]).toMatchObject({
      id: "doc-1",
      reviewer_email: "reviewer@example.com",
    });
    expect(documentQuery).toContain("AND d.id = ?");
    expect(documentBindings).toEqual([
      "mathematics",
      "doc-1",
      "member@example.com",
    ]);
  });

  it("does not add out-of-scope subject-coordinator documents to the editor list", async () => {
    const documentQueries: string[] = [];
    class ScopedStatement extends EmptyStatement {
      async all<T>() {
        if (this.query.includes("SELECT subject FROM report_admin_permissions"))
          return { results: [{ subject: "mathematics" }] as T[] };
        if (
          this.query.includes(
            "SELECT role, subject FROM editorial_workflow_roles",
          )
        )
          return {
            results: [
              { role: "subject-coordinator", subject: "mathematics" },
            ] as T[],
          };
        if (this.query.includes("FROM editorial_documents")) {
          documentQueries.push(this.query);
          return { results: [] as T[] };
        }
        return { results: [] as T[] };
      }
    }
    const env = {
      ...emptyEnv,
      ADMIN_AUTH_MODE: "cloudflare-access",
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => new ScopedStatement(query),
      },
    };
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/editor/documents", {
        headers: { "Cf-Access-Authenticated-User-Email": "math@example.com" },
      }),
      env as never,
    );

    expect(response.status).toBe(200);
    expect(documentQueries).toHaveLength(1);
    expect(documentQueries[0]).toContain("d.subject IN (?)");
    expect(documentQueries[0]).not.toContain(
      "publication_review_stage='subject-coordinator'",
    );
  });

  it("bounds collaboration presence lookups for large article lists", async () => {
    const presenceRequests: string[] = [];
    const documents = Array.from({ length: 20 }, (_, index) => ({
      id: `document-${index}`,
      source_article_id: null,
      subject: "mathematics",
      category: "group-theory",
      locale: "ja",
      slug: `article-${index}`,
      title: `記事${index}`,
      summary: "要約",
      concept_id: "math.group-theory.example",
      latex_engine: "katex",
      status: "draft",
      created_by: "local-editor@atlasez.test",
      updated_by: "local-editor@atlasez.test",
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: `2026-09-${String(20 - index).padStart(2, "0")}T00:00:00.000Z`,
      reviewed_at: null,
      published_at: null,
      archived_at: null,
      archived_by: null,
      archive_expires_at: null,
      scheduled_publish_at: null,
      publication_review_stage: null,
      created_by_display_name: "ローカル編集者",
      updated_by_display_name: "ローカル編集者",
      created_by_avatar_url: "",
      updated_by_avatar_url: "",
      publication_pr_number: null,
      publication_pr_url: null,
      publication_branch: null,
      publication_action: null,
      publication_requested_at: null,
    }));
    class PresenceStatement extends EmptyStatement {
      async all<T>() {
        if (this.query.includes("FROM editorial_documents d"))
          return { results: documents as T[] };
        return { results: [] as T[] };
      }
    }
    const env = {
      ...emptyEnv,
      EDITORIAL_COLLABORATION: {
        idFromName: (name: string) => name,
        get: (name: string) => ({
          fetch: async () => {
            presenceRequests.push(name);
            return new Response(JSON.stringify({ participants: [] }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          },
        }),
      },
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => new PresenceStatement(query),
      },
    };
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/editor/documents"),
      env as never,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      documents: Array<{ active_editors: unknown[] }>;
    };
    expect(payload.documents).toHaveLength(20);
    expect(presenceRequests).toHaveLength(16);
  });

  it("does not allow a new document to skip directly to feedback-complete", async () => {
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/editor/documents", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          subject: "mathematics",
          category: "group-theory",
          locale: "ja",
          slug: "direct-approval",
          title: "直接承認テスト",
          summary: "直接承認を拒否するテスト",
          conceptId: "math.group-theory.group-definition",
          body: "本文です。",
          latexEngine: "katex",
          status: "approved",
        }),
      }),
      emptyEnv as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "フィードバック済みには直接変更できません。フィードバック依頼を完了し、公開審査の承認を受けてください。",
    });
  });

  it("does not allow an in-progress document to be updated as feedback-complete", async () => {
    class ExistingDocumentStatement extends EmptyStatement {
      async first<T>() {
        if (this.query.includes("FROM editorial_documents"))
          return {
            subject: "mathematics",
            status: "in-review",
            title: "フィードバック中",
            summary: "要約",
            concept_id: "math.group-theory.group-definition",
            body: "本文です。",
            writing_memo: "",
            category: "group-theory",
            locale: "ja",
            slug: "in-review",
            latex_engine: "katex",
            published_at: null,
            scheduled_publish_at: null,
            scheduled_publish_claimed_at: null,
            publication_review_stage: null,
            publication_review_round: 0,
            locked_ranges: "[]",
            article_references: "[]",
          } as T;
        return null as T | null;
      }
    }
    const env = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => new ExistingDocumentStatement(query),
      },
    };
    const response = await worker.fetch(
      new Request(
        "http://localhost/api/admin/editor/documents/22222222-2222-4222-8222-222222222222",
        {
          method: "PATCH",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            subject: "mathematics",
            category: "group-theory",
            locale: "ja",
            slug: "in-review",
            title: "フィードバック中",
            summary: "要約",
            conceptId: "math.group-theory.group-definition",
            body: "本文です。",
            latexEngine: "katex",
            status: "approved",
          }),
        },
      ),
      env as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "フィードバック済みには直接変更できません。フィードバック依頼を完了し、公開審査の承認を受けてください。",
    });
  });

  it("stores new concept metadata with a draft document", async () => {
    class CapturedStatement extends EmptyStatement {
      values: unknown[] = [];

      bind(...values: unknown[]) {
        super.bind(...values);
        this.values = values;
        return this;
      }
    }
    const inserted = new CapturedStatement(
      `INSERT INTO editorial_documents VALUES (${Array.from({ length: 27 }, () => "?").join(", ")})`,
    );
    const env = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) =>
          query.includes("INSERT INTO editorial_documents")
            ? inserted
            : new EmptyStatement(query),
      },
    };
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/editor/documents", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          subject: "mathematics",
          category: "group-theory",
          locale: "ja",
          slug: "group-center",
          title: "群の中心",
          summary: "群の中心を説明します。",
          conceptId: "math.group-theory.group-center",
          conceptName: "群の中心",
          conceptNameEn: "The Center of a Group",
          registerConcept: true,
          body: "本文です。",
          latexEngine: "katex",
          status: "draft",
        }),
      }),
      env as never,
    );

    expect(response.status).toBe(201);
    expect(inserted.values.slice(8, 12)).toEqual([
      "math.group-theory.group-center",
      "群の中心",
      "The Center of a Group",
      1,
    ]);
  });

  it("links an outline item only when subject, category, and slug all match", async () => {
    const queries: string[] = [];
    const bindings: unknown[][] = [];
    class CapturedStatement extends EmptyStatement {
      bind(...values: unknown[]) {
        super.bind(...values);
        bindings.push(values);
        return this;
      }
      async first<T>() {
        if (this.query.includes("kind='subject'"))
          return { id: "subject" } as T;
        if (this.query.includes("kind='category'"))
          return { id: "category" } as T;
        if (this.query.includes("FROM editorial_outline_entries"))
          return { id: outlineId } as T;
        return null as T | null;
      }
    }
    const env = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => {
          queries.push(query);
          return new CapturedStatement(query);
        },
      },
    };
    const outlineId = "00000000-0000-0000-0000-000000000010";
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/editor/documents", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          subject: "subject-1234abcd",
          category: "machine-learning",
          locale: "ja",
          slug: "concentration-inequality",
          title: "集中不等式",
          summary: "要約",
          conceptId: "informatics.machine-learning.concentration-inequality",
          body: "本文です。",
          latexEngine: "katex",
          status: "draft",
          outlineId,
        }),
      }),
      env as never,
    );

    expect(response.status).toBe(201);
    const linkQuery = queries.find(
      (query) =>
        query.includes("UPDATE editorial_outline_entries SET document_id") &&
        query.includes("WHERE id=? AND project_id"),
    );
    expect(linkQuery).toContain("category_slug=? AND slug=?");
    const linkBindings = bindings.find(
      (values) =>
        values.includes(outlineId) &&
        values.includes("subject-1234abcd") &&
        values.includes("machine-learning"),
    );
    expect(linkBindings).toEqual(
      expect.arrayContaining([
        outlineId,
        "subject-1234abcd",
        "machine-learning",
        "concentration-inequality",
      ]),
    );
  });

  it("creates multiple subject coordinator assignments in one request", async () => {
    class CapturedStatement extends EmptyStatement {
      values: unknown[] = [];

      bind(...values: unknown[]) {
        this.values = values;
        return this;
      }
    }
    let batched: CapturedStatement[] = [];
    const env = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => new CapturedStatement(query),
        batch: async (statements: unknown[]) => {
          batched = statements as CapturedStatement[];
          return [];
        },
      },
    };

    const response = await worker.fetch(
      new Request("http://localhost/api/admin/editorial-workflow-roles", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "coordinator@example.com",
          role: "subject-coordinator",
          subjects: ["mathematics", "physics", "mathematics"],
        }),
      }),
      env as never,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true, added: 2 });
    expect(batched).toHaveLength(2);
    expect(batched.map((statement) => statement.values[2])).toEqual([
      "mathematics",
      "physics",
    ]);
  });

  it("reports an unconfigured GitHub publication integration before publishing", async () => {
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/editor/publication-integration"),
      emptyEnv as never,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ready: false,
      configured: false,
      repository: "Atlasez/Atlasez01",
    });
  });

  it("checks the publication repository branch and write permission", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          default_branch: "main",
          archived: false,
          permissions: { pull: true, push: true },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    try {
      const response = await worker.fetch(
        new Request(
          "http://localhost/api/admin/editor/publication-integration",
        ),
        { ...emptyEnv, GITHUB_PUBLISH_TOKEN: "test-token" } as never,
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ready: true,
        repository: "Atlasez/Atlasez01",
        defaultBranch: "main",
        canWrite: true,
        canCreatePullRequest: true,
        automaticMerge: false,
        automationReady: false,
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("uses the installation token permission for GitHub App integrations", async () => {
    const importKeyMock = vi
      .spyOn(crypto.subtle, "importKey")
      .mockResolvedValue({} as CryptoKey);
    const signMock = vi
      .spyOn(crypto.subtle, "sign")
      .mockResolvedValue(new Uint8Array([0]).buffer);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "installation-token",
            permissions: { contents: "write", pull_requests: "write" },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            default_branch: "main",
            archived: false,
            permissions: { pull: false, push: false },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ login: "editorial-reviewer" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ permissions: { pull: true, push: true } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    try {
      const response = await worker.fetch(
        new Request(
          "http://localhost/api/admin/editor/publication-integration",
        ),
        {
          ...emptyEnv,
          GITHUB_APP_ID: "4768541",
          GITHUB_APP_INSTALLATION_ID: "157671744",
          GITHUB_PUBLISH_TOKEN: "review-token",
          GITHUB_APP_PRIVATE_KEY:
            "-----BEGIN PRIVATE KEY-----\nAQ==\n-----END PRIVATE KEY-----",
        } as never,
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ready: true,
        canWrite: true,
        automaticMerge: true,
        automaticReview: true,
        automationReady: true,
      });
    } finally {
      importKeyMock.mockRestore();
      signMock.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("exposes feedback completion progress before publication review", async () => {
    const documentId = "22222222-2222-4222-8222-222222222222";
    const document = {
      id: documentId,
      subject: "mathematics",
      status: "in-review",
      created_by: "local-editor@atlasez.test",
      published_at: null,
      publication_review_stage: null,
      publication_review_round: 0,
    };
    class PublicationStateStatement extends EmptyStatement {
      async first<T>() {
        if (this.query.includes("FROM editorial_documents"))
          return document as T;
        if (this.query.includes("FROM editorial_feedback_task_links"))
          return { total: 2, done: 1 } as T;
        return null as T | null;
      }

      async all<T>() {
        if (this.query.includes("FROM editorial_workflow_roles"))
          return { results: [] as T[] };
        return { results: [] as T[] };
      }
    }
    const env = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => new PublicationStateStatement(query),
      },
    };

    const response = await worker.fetch(
      new Request(
        `http://localhost/api/admin/editor/documents/${documentId}/publication-review`,
      ),
      env as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      feedbackTaskTotal: 2,
      feedbackTaskDone: 1,
      feedbackComplete: false,
      canCompleteWriting: true,
    });
  });

  it("blocks publication review until every feedback task is complete", async () => {
    const documentId = "22222222-2222-4222-8222-222222222222";
    const document = {
      id: documentId,
      subject: "mathematics",
      status: "in-review",
      created_by: "local-editor@atlasez.test",
      published_at: null,
      publication_review_stage: null,
      publication_review_round: 0,
    };
    const executed: string[] = [];
    class PublicationStartStatement extends EmptyStatement {
      async first<T>() {
        if (this.query.includes("FROM editorial_documents"))
          return document as T;
        if (this.query.includes("FROM editorial_feedback_task_links"))
          return { total: 2, done: 1 } as T;
        return null as T | null;
      }

      async all<T>() {
        if (this.query.includes("FROM editorial_workflow_roles"))
          return { results: [] as T[] };
        return { results: [] as T[] };
      }

      async run() {
        executed.push(this.query);
        return {};
      }
    }
    const env = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => new PublicationStartStatement(query),
      },
    };

    const response = await worker.fetch(
      new Request(
        `http://localhost/api/admin/editor/documents/${documentId}/publication-review`,
        {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
          },
          body: "{}",
        },
      ),
      env as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      feedbackTaskTotal: 2,
      feedbackTaskDone: 1,
    });
    expect(executed).toEqual([]);
  });

  it("requires feedback tasks before a draft can enter publication review", async () => {
    const documentId = "22222222-2222-4222-8222-222222222222";
    const document = {
      id: documentId,
      subject: "mathematics",
      status: "draft",
      created_by: "local-editor@atlasez.test",
      published_at: null,
      publication_review_stage: null,
      publication_review_round: 0,
    };
    const executed: string[] = [];
    class DraftPublicationStartStatement extends EmptyStatement {
      async first<T>() {
        if (this.query.includes("FROM editorial_documents"))
          return document as T;
        if (this.query.includes("FROM editorial_feedback_task_links"))
          return { total: 0, done: 0 } as T;
        return null as T | null;
      }

      async run() {
        executed.push(this.query);
        return {};
      }
    }
    const env = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => new DraftPublicationStartStatement(query),
      },
    };

    const response = await worker.fetch(
      new Request(
        `http://localhost/api/admin/editor/documents/${documentId}/publication-review`,
        {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
          },
          body: "{}",
        },
      ),
      env as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error:
        "フィードバック依頼がありません。先にフィードバックを依頼してください。",
    });
    expect(executed).toEqual([]);
  });

  it("requires a project leader even when a subject coordinator is configured", async () => {
    const documentId = "22222222-2222-4222-8222-222222222222";
    const document = {
      id: documentId,
      subject: "mathematics",
      status: "in-review",
      created_by: "local-editor@atlasez.test",
      published_at: null,
      publication_review_stage: null,
      publication_review_round: 0,
    };
    const executed: string[] = [];
    class RolePublicationStartStatement extends EmptyStatement {
      async first<T>() {
        if (this.query.includes("FROM editorial_documents"))
          return document as T;
        if (this.query.includes("FROM editorial_feedback_task_links"))
          return { total: 1, done: 1 } as T;
        return null as T | null;
      }

      async all<T>() {
        if (this.query.includes("role = 'subject-coordinator'"))
          return { results: [{ email: "coordinator@example.com" }] as T[] };
        if (this.query.includes("role = 'project-leader'"))
          return { results: [] as T[] };
        return { results: [] as T[] };
      }

      async run() {
        executed.push(this.query);
        return {};
      }
    }
    const env = {
      ...emptyEnv,
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => new RolePublicationStartStatement(query),
      },
    };

    const response = await worker.fetch(
      new Request(
        `http://localhost/api/admin/editor/documents/${documentId}/publication-review`,
        {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
          },
          body: "{}",
        },
      ),
      env as never,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error:
        "プロジェクトリーダーが設定されていないため、公開審査を開始できません。",
    });
    expect(executed).toEqual([]);
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

  it("creates an article publication PR without writing to main", async () => {
    const documentId = "22222222-2222-4222-8222-222222222222";
    const document = {
      id: documentId,
      source_article_id: null,
      subject: "mathematics",
      category: "overview",
      locale: "ja",
      slug: "test-article",
      title: "テスト記事",
      summary: "テスト用の要約",
      concept_id: "mathematics.overview.test",
      body: "本文です。",
      writing_memo: "",
      latex_engine: "katex",
      status: "approved",
      created_by: "local-editor@atlasez.test",
      updated_by: "local-editor@atlasez.test",
      created_at: "2026-08-28T00:00:00.000Z",
      updated_at: "2026-08-28T00:00:00.000Z",
      reviewed_at: "2026-08-28T00:00:00.000Z",
      published_at: null,
      scheduled_publish_at: null,
      scheduled_publish_claimed_at: null,
      publication_review_stage: null,
      publication_review_round: 0,
      publication_pr_number: null,
      publication_pr_url: null,
      publication_branch: null,
      publication_action: null,
      publication_requested_at: null,
      locked_ranges: "[]",
      article_references: "[]",
    };
    const executed: { query: string; values: unknown[] }[] = [];
    const publicationRun = {
      id: "33333333-3333-4333-8333-333333333333",
      document_id: documentId,
      action: "publish" as const,
      state: "queued" as const,
      attempt: 0,
      pull_request_number: null,
      pull_request_url: null,
      branch: null,
      head_sha: null,
      merge_sha: null,
      last_check_at: null,
      next_attempt_at: null,
      error_code: null,
      error_message: null,
      idempotency_key: `${documentId}:publish:test`,
      lease_until: null,
      failure_kind: null,
      check_name: null,
      check_url: null,
      diagnostic_url: null,
      created_by: "local-editor@atlasez.test",
      created_at: "2026-08-28T00:00:00.000Z",
      updated_at: "2026-08-28T00:00:00.000Z",
    };
    let currentPublicationRun: typeof publicationRun | null = null;
    class PublishStatement extends EmptyStatement {
      private values: unknown[] = [];

      bind(...values: unknown[]) {
        super.bind(...values);
        this.values = values;
        return this;
      }

      async first<T>() {
        if (this.query.includes("FROM editorial_documents"))
          return document as T;
        if (this.query.includes("FROM editorial_publication_runs"))
          return currentPublicationRun as T | null;
        return null as T | null;
      }

      async run() {
        executed.push({ query: this.query, values: this.values });
        if (
          this.query.includes(
            "INSERT OR IGNORE INTO editorial_publication_runs",
          )
        )
          currentPublicationRun = publicationRun;
        return { meta: { changes: 1 } };
      }
    }
    const env = {
      ...emptyEnv,
      GITHUB_PUBLISH_TOKEN: "test-token",
      GITHUB_REPOSITORY: "Atlasez/Atlasez01",
      REPORTS: {
        ...emptyEnv.REPORTS,
        prepare: (query: string) => new PublishStatement(query),
      },
    };
    const requests: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.endsWith("/git/ref/heads/main"))
          return new Response(JSON.stringify({ object: { sha: "base-sha" } }));
        if (
          url.includes("/git/ref/heads/") &&
          !url.endsWith("/git/ref/heads/main")
        )
          return new Response("Not found", { status: 404 });
        if (url.endsWith("/git/refs") && init?.method === "POST")
          return new Response(JSON.stringify({ ref: "refs/heads/editorial" }), {
            status: 201,
          });
        if (url.includes("/contents/") && !init?.method)
          return new Response("Not found", { status: 404 });
        if (url.includes("/contents/") && init?.method === "PUT")
          return new Response(
            JSON.stringify({ content: { sha: "article-sha" } }),
            { status: 201 },
          );
        if (url.includes("/pulls?")) return new Response(JSON.stringify([]));
        if (url.endsWith("/pulls") && init?.method === "POST")
          return new Response(
            JSON.stringify({
              number: 321,
              html_url: "https://github.com/Atlasez/Atlasez01/pull/321",
            }),
            { status: 201 },
          );
        throw new Error(`Unexpected GitHub request: ${url}`);
      },
    );
    try {
      const response = await worker.fetch(
        new Request(
          `http://localhost/api/admin/editor/documents/${documentId}/publish`,
          {
            method: "POST",
            headers: {
              origin: "http://localhost",
              "content-type": "application/json",
            },
            body: "{}",
          },
        ),
        env as never,
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        pending: true,
        pullRequestNumber: 321,
        pullRequestUrl: "https://github.com/Atlasez/Atlasez01/pull/321",
      });
      const secondResponse = await worker.fetch(
        new Request(
          `http://localhost/api/admin/editor/documents/${documentId}/publish`,
          {
            method: "POST",
            headers: {
              origin: "http://localhost",
              "content-type": "application/json",
            },
            body: "{}",
          },
        ),
        env as never,
      );
      expect(secondResponse.status).toBe(200);
      await expect(secondResponse.json()).resolves.toMatchObject({
        ok: true,
        pending: true,
        publicationRun: { id: publicationRun.id },
      });
      expect(
        requests.filter(
          (request) =>
            request.url.endsWith("/pulls") && request.init?.method === "POST",
        ),
      ).toHaveLength(1);
      const contentWrites = requests.filter(
        (request) =>
          request.url.includes("/contents/") && request.init?.method === "PUT",
      );
      expect(contentWrites).toHaveLength(1);
      expect(contentWrites[0]?.url).toContain(
        "/contents/src/content/articles/jpn/mathematics/overview/test-article.md",
      );
      const articleWrite = JSON.parse(String(contentWrites[0]?.init?.body));
      expect(articleWrite.branch).toMatch(/^editorial\/published-/);
      expect(articleWrite.branch).not.toBe("main");
      const pullRequest = requests.find((request) =>
        request.url.endsWith("/pulls"),
      );
      const pullRequestBody = JSON.parse(String(pullRequest?.init?.body));
      expect(pullRequestBody.base).toBe("main");
      expect(pullRequestBody.head).toBe(articleWrite.branch);
      expect(
        executed.some(
          (entry) =>
            entry.query.includes("publication_action = ?") &&
            entry.values.includes("publish"),
        ),
      ).toBe(true);

      // 本番のWorkerExecutionContextでは外部GitHub処理を待受後へ移し、
      // 公開受付が外部APIの遅延でタイムアウトしないことを確認する。
      currentPublicationRun = null;
      requests.length = 0;
      const background: Promise<unknown>[] = [];
      const acceptedResponse = await worker.fetch(
        new Request(
          `http://localhost/api/admin/editor/documents/${documentId}/publish`,
          {
            method: "POST",
            headers: {
              origin: "http://localhost",
              "content-type": "application/json",
            },
            body: "{}",
          },
        ),
        env as never,
        {
          waitUntil: (promise: Promise<unknown>) => background.push(promise),
        } as never,
      );
      expect(acceptedResponse.status).toBe(202);
      await expect(acceptedResponse.json()).resolves.toMatchObject({
        ok: true,
        pending: true,
        accepted: true,
        publicationRun: { id: publicationRun.id },
      });
      expect(background).toHaveLength(1);
      await Promise.all(background);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("approves the checked PR from the admin workflow before merging it", async () => {
    const documentId = "22222222-2222-4222-8222-222222222222";
    const run = {
      id: "33333333-3333-4333-8333-333333333333",
      document_id: documentId,
      action: "publish" as const,
      state: "checks_pending" as const,
      attempt: 0,
      pull_request_number: 321,
      pull_request_url: "https://github.com/Atlasez/Atlasez01/pull/321",
      branch: "editorial/published-test",
      head_sha: null,
      merge_sha: null,
      last_check_at: null,
      next_attempt_at: null,
      error_code: null,
      error_message: null,
      created_by: "local-editor@atlasez.test",
      created_at: "2026-08-30T00:00:00.000Z",
      updated_at: "2026-08-30T00:00:00.000Z",
    };
    const document = { id: documentId };
    const executed: { query: string; values: unknown[] }[] = [];
    class PublicationRunStatement extends EmptyStatement {
      private values: unknown[] = [];

      bind(...values: unknown[]) {
        super.bind(...values);
        this.values = values;
        return this;
      }

      async all<T>() {
        if (this.query.includes("FROM editorial_publication_runs"))
          return { results: [run] as T[] };
        return { results: [] as T[] };
      }

      async first<T>() {
        if (this.query.includes("FROM editorial_documents"))
          return document as T;
        return null as T | null;
      }

      async run() {
        executed.push({ query: this.query, values: this.values });
        return { meta: { changes: 1 } };
      }
    }
    const importKeyMock = vi
      .spyOn(crypto.subtle, "importKey")
      .mockResolvedValue({} as CryptoKey);
    const signMock = vi
      .spyOn(crypto.subtle, "sign")
      .mockResolvedValue(new Uint8Array([0]).buffer);
    const requests: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.endsWith("/access_tokens") && init?.method === "POST")
          return new Response(
            JSON.stringify({
              token: "installation-token",
              permissions: { contents: "write", pull_requests: "write" },
            }),
            { status: 201 },
          );
        if (url.endsWith("/pulls/321") && !init?.method)
          return new Response(
            JSON.stringify({
              number: 321,
              state: "open",
              user: { login: "publisher-bot" },
              head: { sha: "head-sha" },
              draft: false,
              mergeable_state: "clean",
            }),
          );
        if (url.includes("/check-runs?"))
          return new Response(
            JSON.stringify({
              check_runs: [
                { name: "content", status: "completed", conclusion: "success" },
              ],
            }),
          );
        if (url.endsWith("/user"))
          return new Response(JSON.stringify({ login: "editorial-reviewer" }));
        if (url.includes("/pulls/321/reviews?"))
          return new Response(JSON.stringify([]));
        if (url.endsWith("/pulls/321/reviews") && init?.method === "POST")
          return new Response(
            JSON.stringify({ state: "APPROVED", commit_id: "head-sha" }),
            { status: 200 },
          );
        if (url.endsWith("/pulls/321/merge") && init?.method === "PUT")
          return new Response(
            JSON.stringify({ merged: true, sha: "merge-sha" }),
            { status: 200 },
          );
        throw new Error(`Unexpected GitHub request: ${url}`);
      },
    );
    const pending: Promise<unknown>[] = [];
    try {
      const response = await worker.scheduled(
        { cron: "*/1 * * * *" },
        {
          ...emptyEnv,
          GITHUB_APP_ID: "4768541",
          GITHUB_APP_INSTALLATION_ID: "157671744",
          GITHUB_APP_PRIVATE_KEY:
            "-----BEGIN PRIVATE KEY-----\nAQ==\n-----END PRIVATE KEY-----",
          GITHUB_REVIEW_TOKEN: "review-token",
          REPORTS: {
            ...emptyEnv.REPORTS,
            prepare: (query: string) => new PublicationRunStatement(query),
          },
        } as never,
        { waitUntil: (promise: Promise<unknown>) => pending.push(promise) },
      );

      expect(response).toBeUndefined();
      await Promise.all(pending);
      const review = requests.find(
        (request) =>
          request.url.endsWith("/pulls/321/reviews") &&
          request.init?.method === "POST",
      );
      expect(review).toBeDefined();
      expect(JSON.parse(String(review?.init?.body))).toMatchObject({
        event: "APPROVE",
      });
      expect(
        requests.some(
          (request) =>
            request.url.endsWith("/pulls/321/merge") &&
            request.init?.method === "PUT",
        ),
      ).toBe(true);
      expect(
        executed.some((entry) => entry.values.includes("deploy_pending")),
      ).toBe(true);
    } finally {
      importKeyMock.mockRestore();
      signMock.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("classifies transient CI failures and stores the check log for retry", async () => {
    const documentId = "44444444-4444-4444-8444-444444444444";
    const run = {
      id: "55555555-5555-4555-8555-555555555555",
      document_id: documentId,
      action: "publish" as const,
      state: "checks_pending" as const,
      attempt: 0,
      pull_request_number: 654,
      pull_request_url: "https://github.com/Atlasez/Atlasez01/pull/654",
      branch: "editorial/published-transient",
      head_sha: null,
      merge_sha: null,
      last_check_at: null,
      next_attempt_at: null,
      error_code: null,
      error_message: null,
      idempotency_key: "run-555",
      lease_until: null,
      failure_kind: null,
      check_name: null,
      check_url: null,
      diagnostic_url: null,
      created_by: "local-editor@atlasez.test",
      created_at: "2026-08-30T00:00:00.000Z",
      updated_at: "2026-08-30T00:00:00.000Z",
    };
    const executed: { query: string; values: unknown[] }[] = [];
    class TransientPublicationStatement extends EmptyStatement {
      private values: unknown[] = [];

      bind(...values: unknown[]) {
        super.bind(...values);
        this.values = values;
        return this;
      }

      async all<T>() {
        if (this.query.includes("FROM editorial_publication_runs"))
          return { results: [run] as T[] };
        return { results: [] as T[] };
      }

      async first<T>() {
        if (this.query.includes("FROM editorial_documents"))
          return { id: documentId } as T;
        return null as T | null;
      }

      async run() {
        executed.push({ query: this.query, values: this.values });
        return { meta: { changes: 1 } };
      }
    }
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("/pulls/654"))
        return new Response(
          JSON.stringify({
            number: 654,
            state: "open",
            user: { login: "publisher-bot" },
            head: { sha: "transient-head" },
            draft: false,
            mergeable_state: "clean",
          }),
        );
      if (url.includes("/check-runs?"))
        return new Response(
          JSON.stringify({
            check_runs: [
              {
                id: 654,
                name: "content-check",
                status: "completed",
                conclusion: "timed_out",
                html_url:
                  "https://github.com/Atlasez/Atlasez01/actions/runs/654",
                details_url:
                  "https://github.com/Atlasez/Atlasez01/actions/runs/654/job/765",
              },
            ],
          }),
        );
      if (url.endsWith("/check-runs/654"))
        return new Response(
          JSON.stringify({ output: { summary: "CI verify" } }),
        );
      if (url.endsWith("/check-runs/654/annotations?per_page=50"))
        return new Response(JSON.stringify([]));
      if (url.endsWith("/actions/jobs/765/logs"))
        return new Response(
          "2026-08-30T00:00:00.000Z ##[group]Run node scripts/validate-content.mjs\n" +
            "2026-08-30T00:00:01.000Z コンテンツ検証エラー: 1件\n" +
            "2026-08-30T00:00:01.000Z  - /home/runner/work/Atlasez01/Atlasez01/src/content/articles/jpn/mathematics/test.md: 存在しない概念 example.category.concept を参照\n",
        );
      throw new Error(`Unexpected GitHub request: ${url}`);
    });
    const pending: Promise<unknown>[] = [];
    try {
      await worker.scheduled(
        { cron: "*/1 * * * *" },
        {
          ...emptyEnv,
          GITHUB_PUBLISH_TOKEN: "test-token",
          REPORTS: {
            ...emptyEnv.REPORTS,
            prepare: (query: string) =>
              new TransientPublicationStatement(query),
          },
        } as never,
        { waitUntil: (promise: Promise<unknown>) => pending.push(promise) },
      );
      await Promise.all(pending);

      expect(requests.some((url) => url.includes("/check-runs?"))).toBe(true);
      const publicationUpdates = executed.filter((entry) =>
        entry.query.includes("UPDATE editorial_publication_runs"),
      );
      expect(
        publicationUpdates.some(
          (entry) =>
            entry.values.includes("retry_wait") &&
            entry.values.includes("ci") &&
            entry.values.includes("ci_transient_failure") &&
            entry.values.includes(
              "https://github.com/Atlasez/Atlasez01/actions/runs/654/job/765",
            ),
        ),
      ).toBe(true);
      expect(
        publicationUpdates.some(
          (entry) =>
            entry.values.includes(
              "src/content/articles/jpn/mathematics/test.md",
            ) &&
            entry.values.includes("node scripts/validate-content.mjs") &&
            entry.values.includes(
              "記事の概念IDを、運営サイトで登録済みの概念IDへ修正して保存し、公開処理を再試行してください。",
            ),
        ),
      ).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stops a publication run when its article snapshot is stale", async () => {
    const documentId = "66666666-6666-4666-8666-666666666666";
    const run = {
      id: "77777777-7777-4777-8777-777777777777",
      document_id: documentId,
      action: "publish" as const,
      state: "checks_pending" as const,
      attempt: 0,
      pull_request_number: 321,
      pull_request_url: "https://github.com/Atlasez/Atlasez01/pull/321",
      branch: "editorial/published-stale",
      head_sha: null,
      merge_sha: null,
      last_check_at: null,
      next_attempt_at: null,
      error_code: null,
      error_message: null,
      idempotency_key: "stale-run",
      lease_until: null,
      failure_kind: null,
      check_name: null,
      check_url: null,
      diagnostic_url: null,
      preflight_run_id: null,
      preflight_requested_at: null,
      snapshot_updated_at: "2026-08-30T00:00:00.000Z",
      snapshot_hash: "hash-of-an-older-version",
      created_by: "local-editor@atlasez.test",
      created_at: "2026-08-30T00:00:00.000Z",
      updated_at: "2026-08-30T00:00:00.000Z",
    };
    const document = {
      id: documentId,
      subject: "mathematics",
      category: "overview",
      locale: "ja",
      slug: "stale-article",
      title: "更新済み記事",
      summary: "概要",
      concept_id: "mathematics.overview.stale",
      body: "新しい本文",
      article_references: "[]",
      latex_engine: "katex" as const,
      status: "approved" as const,
      updated_at: "2026-08-30T00:01:00.000Z",
    };
    const executed: { query: string; values: unknown[] }[] = [];
    class StalePublicationStatement extends EmptyStatement {
      private values: unknown[] = [];

      bind(...values: unknown[]) {
        super.bind(...values);
        this.values = values;
        return this;
      }

      async all<T>() {
        if (this.query.includes("FROM editorial_publication_runs"))
          return { results: [run] as T[] };
        return { results: [] as T[] };
      }

      async first<T>() {
        if (this.query.includes("FROM editorial_documents"))
          return document as T;
        if (this.query.includes("FROM editorial_publication_runs"))
          return { document_id: documentId } as T;
        return null as T | null;
      }

      async run() {
        executed.push({ query: this.query, values: this.values });
        return { meta: { changes: 1 } };
      }
    }
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      requests.push(String(input));
      throw new Error("GitHub should not be called for a stale run");
    });
    const pending: Promise<unknown>[] = [];
    try {
      await worker.scheduled(
        { cron: "*/1 * * * *" },
        {
          ...emptyEnv,
          REPORTS: {
            ...emptyEnv.REPORTS,
            prepare: (query: string) => new StalePublicationStatement(query),
          },
        } as never,
        { waitUntil: (promise: Promise<unknown>) => pending.push(promise) },
      );
      await Promise.all(pending);
      expect(requests).toHaveLength(0);
      expect(
        executed.some((entry) =>
          entry.values.includes("publication_superseded"),
        ),
      ).toBe(true);
      expect(
        executed.some((entry) => entry.values.includes("needs_operator")),
      ).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
