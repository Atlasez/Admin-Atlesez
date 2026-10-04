import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import worker from "../../src/admin-worker";
import { dispatchApplicationEmails } from "../../src/lib/application-email-delivery";

class Statement {
  values: SQLInputValue[] = [];
  constructor(
    readonly query: string,
    readonly db: DatabaseSync,
  ) {}
  bind(...values: unknown[]) {
    this.values = values as SQLInputValue[];
    return this;
  }
  async first<T>() {
    return (
      (this.db.prepare(this.query).get(...this.values) as T | undefined) ?? null
    );
  }
  async all<T>() {
    return { results: this.db.prepare(this.query).all(...this.values) as T[] };
  }
  async run() {
    return {
      meta: {
        changes: Number(
          this.db.prepare(this.query).run(...this.values).changes,
        ),
      },
    };
  }
}

const databases: DatabaseSync[] = [];
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("隔離受入検証から外部通信は禁止");
    }),
  ),
);
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function environment() {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  const migrationDirectory = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(migrationDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(new URL(file, migrationDirectory), "utf8"));
  db.exec("PRAGMA foreign_keys=ON");
  const env = {
    ADMIN_AUTH_MODE: "google-oauth",
    ADMIN_PRIMARY_EMAIL: "global@atlasez.test",
    APPLICATION_OPERATIONS_EMAILS: "operator@atlasez.test",
    REPORTS: {
      prepare: (query: string) => new Statement(query, db),
      batch: async (statements: Statement[]) => {
        db.exec("BEGIN");
        try {
          const results = [];
          for (const statement of statements)
            results.push(
              /^\s*SELECT\b/i.test(statement.query)
                ? await statement.all()
                : await statement.run(),
            );
          db.exec("COMMIT");
          return results;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    },
    ASSETS: {
      fetch: async () =>
        new Response("isolated fixture", {
          headers: { "content-type": "text/html" },
        }),
    },
  };
  const session = (email: string) => {
    const token = `isolated-${email}`;
    db.prepare(
      "INSERT OR REPLACE INTO admin_auth_sessions(session_hash,email,expires_at,created_at) VALUES (?,?,?,?)",
    ).run(
      createHash("sha256").update(token).digest("hex"),
      email,
      "2099-01-01T00:00:00.000Z",
      new Date().toISOString(),
    );
    return token;
  };
  const request = (
    path: string,
    email: string,
    body?: unknown,
    origin = "https://admin.atlasez.test",
  ) =>
    worker.fetch(
      new Request(`https://admin.atlasez.test${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          cookie: `atlasez_admin_session=${session(email)}`,
          origin,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env as never,
    );
  return { db, request, env };
}

function calendarAuditMember(db: DatabaseSync, email: string) {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO atlasez_member_applications(id,name,email,interests,message,status,created_at,updated_at,project_slug) VALUES (?,?,?,?,?,'accepted',?,?,'thinking-cafe')",
  ).run(`application-${email}`, "検証会員", email, "討論", "検証", now, now);
  db.prepare(
    "INSERT INTO editorial_member_profiles(email,display_name,bio,updated_at) VALUES (?,?,?,?)",
  ).run(email, "検証会員", "基本プロフィール", now);
  db.prepare(
    "INSERT INTO editorial_project_member_profiles(project_id,email,internal_bio,updated_at) VALUES ('thinking-cafe',?,?,?)",
  ).run(email, "プロジェクト内プロフィール", now);
  db.prepare(
    "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('thinking-cafe',?,'member',?)",
  ).run(email, now);
}

const creatorAuditArticle = {
  locale: "ja",
  subject: "mathematics",
  category: "ring-theory",
  slug: "ring-definition",
};

function creatorAuditGithubFixture(env: ReturnType<typeof environment>["env"]) {
  Object.assign(env, {
    GITHUB_PUBLISH_TOKEN: "isolated-test-token",
    GITHUB_REPOSITORY: "Atlasez/Atlasez01",
  });
  const path =
    "src/content/articles/jpn/mathematics/ring-theory/ring-definition.md";
  const markdown = `---
articleId: ja-mathematics-ring-definition
locale: ja
title: 環の定義
slug: ring-definition
subject: mathematics
category: ring-theory
concepts:
  - id: math.ring-theory.ring-definition
status: published
summary: 環の定義を説明します。
references: []
---

## 環の定義

公開済みの本文です。
`;
  const content = btoa(
    String.fromCharCode(...new TextEncoder().encode(markdown)),
  );
  const githubFetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const method =
        init?.method ?? (input instanceof Request ? input.method : "GET");
      if (method !== "GET")
        throw new Error(`公開記事の受入検証で書き込みは禁止: ${method} ${url}`);
      const base = "https://api.github.com/repos/Atlasez/Atlasez01";
      if (url === `${base}/contents/${path}?ref=main`)
        return Response.json({
          content,
          encoding: "base64",
          sha: "isolated-ring-sha",
          type: "file",
        });
      if (url === `${base}/git/trees/main?recursive=1`)
        return Response.json({
          tree: [{ path, type: "blob", sha: "isolated-ring-sha" }],
        });
      if (url === `${base}/git/blobs/isolated-ring-sha`)
        return Response.json({ content, encoding: "base64" });
      throw new Error(`隔離受入検証の想定外通信: ${url}`);
    },
  );
  vi.stubGlobal("fetch", githubFetch);
  return githubFetch;
}

function creatorAuditProfile(db: DatabaseSync) {
  db.prepare(
    "INSERT INTO editorial_member_profiles(email,display_name,avatar_url,updated_at) VALUES ('global@atlasez.test','個人の表示名','https://example.test/person.png',?)",
  ).run(new Date().toISOString());
}

it("運営作成原稿の一覧・詳細は個人プロフィールを作者に使わず、個人原稿と更新案だけ個人ワークスペース・記事数に含める", async () => {
  const { db, request } = environment();
  creatorAuditProfile(db);
  const now = new Date().toISOString();
  const organizationId = "630fac16-45e3-5742-a023-5f060786f130";
  const personId = "06a9aafd-8bcd-42d2-aacf-9713be232eaa";
  const proposalId = "32b7cf2d-bb75-469d-922e-a2eb8d6ea4b4";
  const insert = db.prepare(
    "INSERT INTO editorial_documents(id,creator_kind,document_kind,base_document_id,source_article_id,subject,category,slug,title,concept_id,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,'mathematics','ring-theory',?,?,'math.ring-theory.ring-definition','global@atlasez.test','global@atlasez.test',?,?)",
  );
  insert.run(
    organizationId,
    "organization",
    "canonical",
    null,
    "ja-mathematics-ring-definition",
    "ring-definition",
    "運営の原稿",
    now,
    now,
  );
  insert.run(
    personId,
    "person",
    "canonical",
    null,
    null,
    "personal-definition",
    "個人の原稿",
    now,
    now,
  );
  insert.run(
    proposalId,
    "person",
    "update-proposal",
    organizationId,
    "ja-mathematics-ring-definition",
    "proposal-definition",
    "個人の更新案",
    now,
    now,
  );
  const listResponse = await request(
    "/api/admin/editor/documents",
    "global@atlasez.test",
  );
  expect(listResponse.status, await listResponse.clone().text()).toBe(200);
  const list = (await listResponse.json()) as {
    documents: Array<Record<string, unknown>>;
  };
  expect(list.documents).toHaveLength(3);
  for (const id of [organizationId, personId, proposalId]) {
    const expected = {
      id,
      creator_kind: id === organizationId ? "organization" : "person",
      created_by: "global@atlasez.test",
      created_by_display_name:
        id === organizationId ? "Atlasez運営" : "個人の表示名",
      created_by_avatar_url:
        id === organizationId ? "" : "https://example.test/person.png",
      updated_by_display_name: "個人の表示名",
      updated_by_avatar_url: "https://example.test/person.png",
    };
    expect(list.documents.find((document) => document.id === id)).toMatchObject(
      expected,
    );
    const detailResponse = await request(
      `/api/admin/editor/documents/${id}`,
      "global@atlasez.test",
    );
    expect(detailResponse.status, await detailResponse.clone().text()).toBe(
      200,
    );
    expect(await detailResponse.json()).toMatchObject({ document: expected });
  }
  const workspaceResponse = await request(
    "/api/admin/personal-workspace",
    "global@atlasez.test",
  );
  expect(workspaceResponse.status).toBe(200);
  const workspace = (await workspaceResponse.json()) as {
    documents: Array<{ id: string }>;
  };
  expect(workspace.documents.map((document) => document.id).sort()).toEqual(
    [personId, proposalId].sort(),
  );
  const memberResponse = await request(
    "/api/admin/member-management?email=global%40atlasez.test",
    "global@atlasez.test",
  );
  expect(memberResponse.status, await memberResponse.clone().text()).toBe(200);
  expect(await memberResponse.json()).toMatchObject({
    member: { articleCount: 2 },
  });
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("公開記事registerは実SQLで運営作成・操作者記録を分離し、再登録とカタログ観測でも取り込み根拠を維持する", async () => {
  const { db, request, env } = environment();
  creatorAuditProfile(db);
  const githubFetch = creatorAuditGithubFixture(env);
  const registeredResponse = await request(
    "/api/admin/editor/catalog/register",
    "global@atlasez.test",
    creatorAuditArticle,
  );
  expect(
    registeredResponse.status,
    await registeredResponse.clone().text(),
  ).toBe(201);
  const registered = (await registeredResponse.json()) as {
    documentId: string;
  };
  const expected = {
    id: registered.documentId,
    creator_kind: "organization",
    source_article_id: "ja-mathematics-ring-definition",
    created_by: "global@atlasez.test",
    updated_by: "global@atlasez.test",
    status: "draft",
  };
  expect(
    db
      .prepare("SELECT * FROM editorial_documents WHERE id=?")
      .get(registered.documentId),
  ).toMatchObject(expected);
  for (const path of [
    `/api/admin/editor/documents/${registered.documentId}`,
    "/api/admin/editor/documents",
  ]) {
    const response = await request(path, "global@atlasez.test");
    expect(response.status, await response.clone().text()).toBe(200);
    const payload = (await response.json()) as {
      document?: Record<string, unknown>;
      documents?: Array<Record<string, unknown>>;
    };
    expect(payload.document ?? payload.documents?.[0]).toMatchObject({
      ...expected,
      created_by_display_name: "Atlasez運営",
      created_by_avatar_url: "",
      updated_by_display_name: "個人の表示名",
    });
  }
  const repeated = await request(
    "/api/admin/editor/catalog/register",
    "global@atlasez.test",
    creatorAuditArticle,
  );
  expect(repeated.status, await repeated.clone().text()).toBe(200);
  expect(await repeated.json()).toMatchObject({
    documentId: registered.documentId,
  });
  const observed = await request(
    "/api/admin/editor/catalog",
    "global@atlasez.test",
  );
  expect(observed.status, await observed.clone().text()).toBe(200);
  expect(
    db
      .prepare(
        "SELECT document_id,registration_method,registered_by FROM editorial_article_catalog",
      )
      .all(),
  ).toEqual([
    {
      document_id: registered.documentId,
      registration_method: "public-article-adoption",
      registered_by: "global@atlasez.test",
    },
  ]);
  expect(
    db.prepare("SELECT COUNT(*) AS count FROM editorial_documents").get(),
  ).toEqual({ count: 1 });
  const workspace = await request(
    "/api/admin/personal-workspace",
    "global@atlasez.test",
  );
  expect(await workspace.json()).toMatchObject({ documents: [] });
  expect(githubFetch).toHaveBeenCalled();
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("旧jaディレクトリのカタログ行をcanonicalなjpn pathへ寄せて公開記事を登録する", async () => {
  const { db, request, env } = environment();
  creatorAuditProfile(db);
  creatorAuditGithubFixture(env);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO editorial_article_catalog
      (path,identity_key,repository,locale,subject,category,slug,source_article_id,title,last_seen_at,registration_method)
     VALUES ('src/content/articles/ja/mathematics/ring-theory/ring-definition.md',?,'Atlasez/Atlasez01','ja','mathematics','ring-theory','ring-definition','ja-mathematics-ring-definition','環の定義',?,'catalog-observation')`,
  ).run("ja/mathematics/ring-theory/ring-definition", now);

  const response = await request(
    "/api/admin/editor/catalog/register",
    "global@atlasez.test",
    creatorAuditArticle,
  );
  expect(response.status, await response.clone().text()).toBe(201);
  const { documentId } = (await response.json()) as { documentId: string };
  expect(
    db
      .prepare(
        "SELECT path,document_id,registration_method,registered_by FROM editorial_article_catalog",
      )
      .all(),
  ).toEqual([
    {
      path: "src/content/articles/jpn/mathematics/ring-theory/ring-definition.md",
      document_id: documentId,
      registration_method: "public-article-adoption",
      registered_by: "global@atlasez.test",
    },
  ]);
  expect(
    db.prepare("SELECT COUNT(*) AS count FROM editorial_documents").get(),
  ).toEqual({ count: 1 });
  expect(
    db.prepare("SELECT COUNT(*) AS count FROM editorial_comments").get(),
  ).toEqual({ count: 0 });
  expect(
    db.prepare("SELECT COUNT(*) AS count FROM editorial_tasks").get(),
  ).toEqual({ count: 0 });
});

it("公開記事IDが別identityの原稿にある場合は未登録と誤表示せず競合として返す", async () => {
  const { db, request, env } = environment();
  creatorAuditGithubFixture(env);
  const documentId = "850a1ce1-1123-4b27-b92c-d9276a9e2a01";
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO editorial_documents
      (id,source_article_id,subject,category,locale,slug,title,concept_id,body,created_by,updated_by,created_at,updated_at)
     VALUES (?, 'ja-mathematics-ring-definition','mathematics','overview','ja','ring-definition','環の定義','math.overview.ring-definition','保持する本文','global@atlasez.test','global@atlasez.test',?,?)`,
  ).run(documentId, now, now);

  const response = await request(
    "/api/admin/editor/catalog",
    "global@atlasez.test",
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const payload = (await response.json()) as {
    catalog: Array<Record<string, unknown>>;
  };
  expect(
    payload.catalog.find(
      (entry) =>
        entry.identity_key === "ja/mathematics/ring-theory/ring-definition",
    ),
  ).toMatchObject({
    state: "identity-conflict",
    editorial_document_id: documentId,
  });

  const diagnostics = await request(
    "/api/admin/editor/catalog/diagnostics",
    "global@atlasez.test",
  );
  expect(diagnostics.status).toBe(200);
  const result = (await diagnostics.json()) as {
    issues: Array<Record<string, unknown>>;
  };
  expect(
    result.issues.filter(
      (issue) =>
        issue.identity_key === "ja/mathematics/ring-theory/ring-definition",
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "identity-mismatch",
        severity: "error",
        document_id: documentId,
      }),
    ]),
  );
  expect(
    result.issues.some(
      (issue) =>
        issue.identity_key === "ja/mathematics/ring-theory/ring-definition" &&
        issue.code === "unregistered",
    ),
  ).toBe(false);
});

it("公開記事の一括登録は重複を除き、競合記事があっても他記事を続け、通知系レコードを作らない", async () => {
  const { db, request, env } = environment();
  creatorAuditProfile(db);
  creatorAuditGithubFixture(env);
  const response = await request(
    "/api/admin/editor/catalog/register-bulk",
    "global@atlasez.test",
    {
      articles: [
        creatorAuditArticle,
        creatorAuditArticle,
        { ...creatorAuditArticle, slug: "unavailable-article" },
      ],
    },
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const result = (await response.json()) as {
    attempted: number;
    results: Array<{ status: string }>;
  };
  expect(result.attempted).toBe(2);
  expect(result.results.map((item) => item.status)).toEqual([
    "registered",
    "failed",
  ]);
  expect(
    db.prepare("SELECT COUNT(*) AS count FROM editorial_documents").get(),
  ).toEqual({ count: 1 });
  expect(
    db.prepare("SELECT COUNT(*) AS count FROM editorial_comments").get(),
  ).toEqual({ count: 0 });
  expect(
    db.prepare("SELECT COUNT(*) AS count FROM editorial_tasks").get(),
  ).toEqual({ count: 0 });
});

it("既存の個人原稿への公開記事linkは本文・作者種別・操作者を維持する", async () => {
  const { db, request, env } = environment();
  creatorAuditProfile(db);
  creatorAuditGithubFixture(env);
  const id = "850a1ce1-1123-4b27-b92c-d9276a9e2ee5";
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO editorial_documents(id,subject,category,slug,title,concept_id,body,created_by,updated_by,created_at,updated_at) VALUES (?,'mathematics','ring-theory','ring-definition','個人の元原稿','math.ring-theory.ring-definition','個人の本文を維持','global@atlasez.test','global@atlasez.test',?,?)",
  ).run(id, now, now);
  const response = await request(
    "/api/admin/editor/catalog/register",
    "global@atlasez.test",
    creatorAuditArticle,
  );
  expect(response.status, await response.clone().text()).toBe(200);
  expect(await response.json()).toMatchObject({
    documentId: id,
    bodySeed: "existing-editorial-document-preserved",
    publicationStarted: false,
  });
  expect(
    db.prepare("SELECT * FROM editorial_documents WHERE id=?").get(id),
  ).toMatchObject({
    creator_kind: "person",
    created_by: "global@atlasez.test",
    title: "個人の元原稿",
    body: "個人の本文を維持",
    source_article_id: "ja-mathematics-ring-definition",
  });
  const detail = await request(
    `/api/admin/editor/documents/${id}`,
    "global@atlasez.test",
  );
  expect(detail.status).toBe(200);
  expect(await detail.json()).toMatchObject({
    document: {
      creator_kind: "person",
      created_by_display_name: "個人の表示名",
      created_by_avatar_url: "https://example.test/person.png",
    },
  });
  const workspace = await request(
    "/api/admin/personal-workspace",
    "global@atlasez.test",
  );
  expect(await workspace.json()).toMatchObject({ documents: [{ id }] });
  expect(
    db
      .prepare("SELECT registration_method FROM editorial_article_catalog")
      .get(),
  ).toEqual({ registration_method: "public-article-link" });
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("ポータルの個人期限をUTCに正規化し表示タイムゾーンの今日・翌日境界を集計する", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T00:00:00.000Z"));
  const { db, request } = environment();
  const insert = db.prepare(
    "INSERT INTO editorial_tasks(id,project_id,assignee_email,title,created_by,due_at,due_timezone,created_at,updated_at) VALUES (?,'atlas','global@atlasez.test',?,'global@atlasez.test',?,?,?,?)",
  );
  for (const [id, due, timezone] of [
    ["tokyo", "2026-10-03T23:59", "Asia/Tokyo"],
    ["new-york", "2026-10-03T10:59", "America/New_York"],
    ["tomorrow", "2026-10-04T00:00", "Asia/Tokyo"],
  ])
    insert.run(
      id,
      id,
      due,
      timezone,
      "2026-10-01T00:00:00Z",
      "2026-10-01T00:00:00Z",
    );
  const portalResponse = await request(
    "/api/admin/portal?timezone=Asia%2FTokyo",
    "global@atlasez.test",
  );
  expect(portalResponse.status, await portalResponse.clone().text()).toBe(200);
  const portal = (await portalResponse.json()) as {
    taskSummary: { openCount: number; dueToday: number; dueSoon: number };
    calendar: { events: Array<{ id: string; startsAt: string }> };
  };
  expect(portal.taskSummary).toEqual({ openCount: 3, dueToday: 2, dueSoon: 1 });
  expect(
    portal.calendar.events.find((event) => event.id === "task:tokyo")?.startsAt,
  ).toBe("2026-10-03T14:59:00.000Z");
  expect(
    portal.calendar.events.find((event) => event.id === "task:new-york")
      ?.startsAt,
  ).toBe("2026-10-03T14:59:00.000Z");
  const center = (await (
    await request(
      "/api/admin/action-center?timezone=Asia%2FTokyo",
      "global@atlasez.test",
    )
  ).json()) as { counts: { today: number; dueSoon: number } };
  expect(center.counts).toMatchObject({ today: 2, dueSoon: 1 });
  const otherZone = (await (
    await request(
      "/api/admin/portal?timezone=America%2FNew_York",
      "global@atlasez.test",
    )
  ).json()) as { taskSummary: { dueToday: number; dueSoon: number } };
  expect(otherZone.taskSummary).toMatchObject({ dueToday: 0, dueSoon: 3 });
});

it("過去の予定が70件あっても表示月の重複予定を両カレンダーAPIで全ページ取得する", async () => {
  const { db, request } = environment();
  const insert = db.prepare(
    "INSERT INTO editorial_events(id,project_id,title,starts_at,ends_at,created_by,created_at) VALUES (?,'atlas',?,?,?,'global@atlasez.test','2026-01-01T00:00:00.000Z')",
  );
  for (let index = 0; index < 70; index++)
    insert.run(`old-${index}`, "過去日程", "2026-01-01T00:00:00.000Z", null);
  insert.run(
    "month-span",
    "月を跨ぐ日程",
    "2026-09-30T20:00:00.000Z",
    "2026-10-01T02:00:00.000Z",
  );
  insert.run("month-point", "点日程", "2026-10-02T00:00:00.000Z", null);
  insert.run(
    "month-zero",
    "終了が同時の日程",
    "2026-10-03T00:00:00.000Z",
    "2026-10-03T00:00:00.000Z",
  );
  insert.run("outside-end", "翌月日程", "2026-11-01T00:00:00.000Z", null);
  insert.run(
    "outside-start",
    "前月終了",
    "2026-09-30T20:00:00Z",
    "2026-10-01T00:00:00Z",
  );
  insert.run(
    "outside-offset",
    "UTCでは前月の日程",
    "2026-10-01T00:00:00+09:00",
    null,
  );
  for (const endpoint of [
    "/api/admin/member-calendar",
    "/api/admin/operations?project=atlas",
  ]) {
    const params = new URLSearchParams({
      start: "2026-10-01T00:00:00Z",
      end: "2026-11-01T00:00:00Z",
      eventLimit: "1",
    });
    const ids: string[] = [];
    for (let page = 0; page < 4; page++) {
      const response = await request(
        `${endpoint}${endpoint.includes("?") ? "&" : "?"}${params}`,
        "global@atlasez.test",
      );
      expect(response.status, await response.clone().text()).toBe(200);
      const payload = (await response.json()) as {
        events: Array<{ id: string }>;
        eventPagination: { nextCursor: string | null; hasMore: boolean };
      };
      ids.push(...payload.events.map((event) => event.id));
      if (!payload.eventPagination.hasMore) break;
      expect(payload.eventPagination.nextCursor).toBeTruthy();
      params.set("eventCursor", payload.eventPagination.nextCursor!);
    }
    expect(ids).toEqual(["month-span", "month-point", "month-zero"]);
  }
  expect(
    (
      await request(
        "/api/admin/member-calendar?start=invalid&end=2026-11-01T00:00:00Z",
        "global@atlasez.test",
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await request(
        "/api/admin/operations?start=2026-01-01T00:00:00Z&end=2026-11-01T00:00:00Z",
        "global@atlasez.test",
      )
    ).status,
  ).toBe(400);
});

it("メンバー向け通知とアーカイブ履歴のリンク先で対象タスクを開ける", async () => {
  const { db, request } = environment();
  const email = "member-notification@atlasez.test";
  calendarAuditMember(db, email);
  const task = "11111111-1111-4111-8111-111111111111";
  const archivedTask = "22222222-2222-4222-8222-222222222222";
  const now = new Date().toISOString();
  const feedbackTask = "44444444-4444-4444-8444-444444444444";
  const documentId = "55555555-5555-4555-8555-555555555555";
  const insert = db.prepare(
    "INSERT INTO editorial_tasks(id,project_id,assignee_email,title,status,created_by,created_at,updated_at,archived_at) VALUES (?,'thinking-cafe',?,?,?, ?,?,?,?)",
  );
  insert.run(
    task,
    email,
    "タスク依頼",
    "open",
    "global@atlasez.test",
    now,
    now,
    null,
  );
  insert.run(
    archivedTask,
    "global@atlasez.test",
    "完了タスク",
    "done",
    "global@atlasez.test",
    now,
    now,
    now,
  );
  insert.run(
    feedbackTask,
    `${email},editor-feedback@atlasez.test`,
    "フィードバック依頼",
    "open",
    "global@atlasez.test",
    now,
    now,
    null,
  );
  db.prepare("UPDATE editorial_tasks SET task_kind='feedback' WHERE id=?").run(
    feedbackTask,
  );
  db.prepare(
    "INSERT INTO editorial_documents(id,subject,category,slug,title,concept_id,created_by,updated_by,created_at,updated_at) VALUES (?,'mathematics','test','test','検証原稿','test','global@atlasez.test','global@atlasez.test',?,?)",
  ).run(documentId, now, now);
  db.prepare(
    "INSERT INTO editorial_feedback_task_links(task_id,document_id,created_at) VALUES (?,?,?)",
  ).run(feedbackTask, documentId, now);
  db.prepare(
    "INSERT INTO report_admin_permissions(email,subject) VALUES (?,'mathematics')",
  ).run("editor-feedback@atlasez.test");
  db.prepare(
    "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('thinking-cafe',?,'member',?)",
  ).run("editor-feedback@atlasez.test", now);
  db.prepare(
    "INSERT INTO editorial_task_reminders(id,task_id,remind_at,remind_at_utc,timezone,label,created_at) VALUES (?,?,?,?,?,?,?)",
  ).run(
    "33333333-3333-4333-8333-333333333333",
    task,
    "2020-01-01T09:00",
    "2020-01-01T00:00:00.000Z",
    "Asia/Tokyo",
    "期限確認",
    now,
  );
  const notificationsResponse = await request(
    "/api/admin/notifications",
    email,
  );
  expect(
    notificationsResponse.status,
    await notificationsResponse.clone().text(),
  ).toBe(200);
  const payload = (await notificationsResponse.json()) as {
    notifications: Array<{ kind: string; href: string }>;
  };
  const taskNotifications = payload.notifications.filter((notification) =>
    ["task-request", "task-reminder", "feedback-request"].includes(
      notification.kind,
    ),
  );
  expect(
    taskNotifications.map((notification) => notification.kind).sort(),
  ).toEqual(["feedback-request", "task-reminder", "task-request"]);
  for (const notification of taskNotifications) {
    expect(notification.href).toBe(
      `/admin/task-detail/?task=${notification.kind === "feedback-request" ? feedbackTask : task}`,
    );
    expect((await request(notification.href, email)).status).toBe(200);
  }
  const editorNotifications = (await (
    await request("/api/admin/notifications", "editor-feedback@atlasez.test")
  ).json()) as { notifications: Array<{ kind: string; href: string }> };
  const feedbackLink = editorNotifications.notifications.find(
    (notification) => notification.kind === "feedback-request",
  )?.href;
  expect(feedbackLink).toBe(`/admin/editor/?document=${documentId}`);
  expect(
    (await request(feedbackLink!, "editor-feedback@atlasez.test")).status,
  ).toBe(200);
  const historyResponse = await request(
    "/api/admin/action-center?view=history",
    "global@atlasez.test",
  );
  expect(historyResponse.status, await historyResponse.clone().text()).toBe(
    200,
  );
  const history = (await historyResponse.json()) as {
    history: Array<{ id: string; href: string }>;
  };
  expect(
    history.history.find((item) => item.id === `task:${archivedTask}`)?.href,
  ).toBe(`/admin/task-detail/?task=${archivedTask}`);
  expect(
    (
      await request(
        `/api/admin/task-workspaces/${archivedTask}`,
        "global@atlasez.test",
      )
    ).status,
  ).toBe(200);
});

it("タスク操作の表示権限は閲覧範囲ではなく管理者・担当者・作成者と一致する", async () => {
  const { db, request } = environment();
  const email = "member-task@atlasez.test";
  calendarAuditMember(db, email);
  const now = new Date().toISOString();
  const insert = db.prepare(
    "INSERT INTO editorial_tasks(id,project_id,assignee_email,title,created_by,created_at,updated_at) VALUES (?,'thinking-cafe',?,?, ?,?,?)",
  );
  insert.run(
    "11111111-1111-4111-8111-111111111111",
    email,
    "自分が担当",
    "global@atlasez.test",
    now,
    now,
  );
  insert.run(
    "22222222-2222-4222-8222-222222222222",
    "other@atlasez.test",
    "自分が作成",
    email,
    now,
    now,
  );
  insert.run(
    "33333333-3333-4333-8333-333333333333",
    "other@atlasez.test",
    "他人のタスク",
    "global@atlasez.test",
    now,
    now,
  );
  const response = await request("/api/admin/member-tasks?view=all", email);
  expect(response.status, await response.clone().text()).toBe(200);
  const payload = (await response.json()) as {
    tasks: Array<{ title: string; can_update: boolean }>;
  };
  expect(
    Object.fromEntries(
      payload.tasks.map((task) => [task.title, task.can_update]),
    ),
  ).toEqual({ 自分が担当: true, 自分が作成: true, 他人のタスク: false });
  const managerResponse = await request(
    "/api/admin/member-tasks?view=all",
    "global@atlasez.test",
  );
  const manager = (await managerResponse.json()) as {
    tasks: Array<{ can_update: boolean }>;
  };
  expect(manager.tasks.every((task) => task.can_update)).toBe(true);
});

it("アクションセンターの期限優先度は保存されたタイムゾーンで判定する", async () => {
  const { db, request } = environment();
  const now = "2026-10-03T00:00:00.000Z";
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(now));
  const insert = db.prepare(
    "INSERT INTO editorial_tasks(id,project_id,assignee_email,title,created_by,due_at,due_timezone,created_at,updated_at) VALUES (?,'atlas','global@atlasez.test',?,'global@atlasez.test',?,?,?,?)",
  );
  insert.run(
    "11111111-1111-4111-8111-111111111111",
    "Tokyo期限超過",
    "2026-10-03T08:00",
    "Asia/Tokyo",
    now,
    now,
  );
  insert.run(
    "22222222-2222-4222-8222-222222222222",
    "New York未来期限",
    "2026-10-03T08:00",
    "America/New_York",
    now,
    now,
  );
  const response = await request(
    "/api/admin/action-center",
    "global@atlasez.test",
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const payload = (await response.json()) as {
    items: Array<{ title: string; priority: string; dueTimezone: string }>;
  };
  expect(
    payload.items.find((item) => item.title === "Tokyo期限超過"),
  ).toMatchObject({ priority: "urgent", dueTimezone: "Asia/Tokyo" });
  expect(
    payload.items.find((item) => item.title === "New York未来期限"),
  ).toMatchObject({ priority: "due-soon", dueTimezone: "America/New_York" });
});

it("全migration適用済みの隔離D1でポータルと通知APIの全SQLを実行する", async () => {
  const { request } = environment();
  const portalResponse = await request(
    "/api/admin/portal",
    "global@atlasez.test",
  );
  expect(portalResponse.status, await portalResponse.clone().text()).toBe(200);
  await expect(portalResponse.json()).resolves.toMatchObject({
    projects: expect.any(Array),
    todos: expect.any(Array),
    calendar: { events: expect.any(Array) },
  });

  const notificationsResponse = await request(
    "/api/admin/notifications",
    "global@atlasez.test",
  );
  expect(
    notificationsResponse.status,
    await notificationsResponse.clone().text(),
  ).toBe(200);
  await expect(notificationsResponse.json()).resolves.toMatchObject({
    notifications: expect.any(Array),
  });
});

it("全migrationを適用した隔離D1で認証・全体管理・別プロジェクト・退会後の境界を確認する", async () => {
  const { db, request, env } = environment();
  const anonymous = await worker.fetch(
    new Request("https://admin.atlasez.test/admin/getting-started/"),
    env as never,
  );
  expect(anonymous.status).toBe(302);
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO atlasez_member_applications(id,name,email,interests,message,status,created_at,updated_at,project_slug) VALUES (?,?,?,?,?,'accepted',?,?,?)",
  ).run(
    "isolated-member-application",
    "検証会員",
    "member@atlasez.test",
    "討論",
    "検証",
    now,
    now,
    "thinking-cafe",
  );
  db.prepare(
    "INSERT INTO editorial_member_profiles(email,display_name,bio,updated_at) VALUES (?,?,?,?)",
  ).run("member@atlasez.test", "検証会員", "基本プロフィール", now);
  db.prepare(
    "INSERT INTO editorial_project_member_profiles(project_id,email,internal_bio,updated_at) VALUES (?,?,?,?)",
  ).run(
    "thinking-cafe",
    "member@atlasez.test",
    "プロジェクト内プロフィール",
    now,
  );
  expect(
    await (await request("/api/user/status", "member@atlasez.test")).json(),
  ).toMatchObject({ stage: "MEMBER" });
  for (const path of ["/admin/getting-started", "/admin/getting-started/"]) {
    expect((await request(path, "member@atlasez.test")).status).toBe(200);
    const applicantResponse = await request(path, "applicant@atlasez.test");
    expect(applicantResponse.status).toBe(302);
    expect(applicantResponse.headers.get("location")).not.toContain(
      "/admin/getting-started",
    );
  }
  db.prepare(
    "INSERT INTO report_admin_permissions(email,subject) VALUES (?,?)",
  ).run("editor@atlasez.test", "mathematics");
  db.prepare(
    "INSERT INTO editorial_workflow_roles(email,role,subject,created_at,created_by) VALUES (?,?,?,?,?)",
  ).run(
    "coordinator@atlasez.test",
    "subject-coordinator",
    "mathematics",
    new Date().toISOString(),
    "global@atlasez.test",
  );
  db.prepare(
    "INSERT INTO report_admin_permissions(email,subject) VALUES (?,?)",
  ).run("cafe-manager@atlasez.test", "mathematics");
  db.prepare(
    "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES (?,?,?,?)",
  ).run(
    "thinking-cafe",
    "cafe-manager@atlasez.test",
    "manager",
    new Date().toISOString(),
  );
  for (const email of [
    "applicant@atlasez.test",
    "member@atlasez.test",
    "editor@atlasez.test",
    "coordinator@atlasez.test",
    "cafe-manager@atlasez.test",
  ]) {
    expect(
      (await request("/api/admin/report-admin-permissions", email)).status,
    ).toBe(403);
  }
  expect(
    (
      await request(
        "/api/admin/report-admin-permissions",
        "global@atlasez.test",
      )
    ).status,
  ).toBe(200);
  expect(
    (await request("/api/admin/editor/documents", "applicant@atlasez.test"))
      .status,
  ).toBe(403);
  expect(
    (await request("/api/admin/editor/documents", "editor@atlasez.test"))
      .status,
  ).toBe(200);
  expect(
    (await request("/api/admin/editor/documents", "coordinator@atlasez.test"))
      .status,
  ).toBe(200);
  expect(
    (
      await request(
        "/api/admin/applications?project=atlas",
        "cafe-manager@atlasez.test",
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        "/api/admin/applications?project=thinking-cafe",
        "cafe-manager@atlasez.test",
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await request(
        "/api/admin/applications?project=atlas",
        "global@atlasez.test",
      )
    ).status,
  ).toBe(200);
  const archived = await request(
    "/api/admin/member-management",
    "global@atlasez.test",
    { action: "archive", email: "editor@atlasez.test" },
  );
  expect(archived.status).toBe(200);
  expect(
    (await request("/admin/getting-started/", "editor@atlasez.test")).status,
  ).toBe(302);
  expect(
    (await request("/api/admin/editor/documents", "editor@atlasez.test"))
      .status,
  ).toBe(403);
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("仮の新規利用者の基本情報保存・応募・二重応募防止・本人以外の非公開を実APIで確認する", async () => {
  const { db, request, env } = environment();
  const email = "applicant@atlasez.test";
  const profile = {
    familyName: "検証",
    givenName: "太郎",
    familyNameKana: "けんしょう",
    givenNameKana: "たろう",
    formLanguage: "ja",
    affiliationEmail: "school@atlasez.test",
    affiliationType: "大学",
    institution: "検証大学",
    grade: "B1",
    country: "日本",
    timezone: "Asia/Tokyo",
    birthDate: "2000-01-01",
    residenceCity: "検証市",
  };
  expect((await request("/api/user/status", email)).status).toBe(200);
  expect(
    (
      await request(
        "/api/application-profile",
        email,
        profile,
        "https://other.atlasez.test",
      )
    ).status,
  ).toBe(403);
  expect(
    (await request("/api/application-profile", email, profile)).status,
  ).toBe(200);
  const application = {
    projectSlug: "thinking-cafe",
    interests: "討論",
    message: "隔離検証",
    referralSource: "公式サイト",
    interviewAvailability: "平日18時 Asia/Tokyo",
    projectAnswers: { theme: "学び" },
  };
  const applied = await request("/api/apply", email, application);
  expect(applied.status, await applied.clone().text()).toBe(201);
  expect((await request("/api/apply", email, application)).status).toBe(409);
  const otherProfile = await request(
    "/api/application-profile",
    "other@atlasez.test",
  );
  expect(await otherProfile.json()).toMatchObject({ profile: null });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_member_applications WHERE email=?",
      )
      .get(email),
  ).toMatchObject({ count: 1 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries WHERE kind='applicant_confirmation'",
      )
      .get(),
  ).toMatchObject({ count: 1 });
  const attempts: string[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(init?.body)) as { to: string[] };
    expect(
      body.to.every((recipient) => recipient.endsWith("@atlasez.test")),
    ).toBe(true);
    attempts.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
    return new Response("{}", { status: attempts.length === 1 ? 503 : 200 });
  });
  const emailEnv = {
    ...env,
    RESEND_API_KEY: "isolated-placeholder",
    EMAIL_FROM: "sender@atlasez.test",
  };
  const now = new Date(Date.now() + 60_000);
  const logger = { info: vi.fn(), error: vi.fn() };
  expect(
    await dispatchApplicationEmails(emailEnv, { fetcher, now, logger }),
  ).toMatchObject({ failed: 1 });
  expect(
    await dispatchApplicationEmails(emailEnv, {
      fetcher,
      now: new Date(now.getTime() + 6 * 60_000),
      logger,
    }),
  ).toMatchObject({ sent: 1, failed: 0 });
  expect(attempts.at(-1)).toBe(attempts[0]);
  const callCount = fetcher.mock.calls.length;
  await dispatchApplicationEmails(emailEnv, {
    fetcher,
    now: new Date(now.getTime() + 12 * 60_000),
    logger,
  });
  expect(fetcher).toHaveBeenCalledTimes(callCount);
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("仮応募者の応募から審査受入・初回オンボーディング・会員画面までを実APIで確認する", async () => {
  const { db, request } = environment();
  const email = "journey@atlasez.test";
  const profile = {
    familyName: "実運用",
    givenName: "検証",
    familyNameKana: "じつうんよう",
    givenNameKana: "けんしょう",
    formLanguage: "ja",
    affiliationEmail: "school@atlasez.test",
    affiliationType: "大学",
    institution: "検証大学",
    grade: "B1",
    country: "日本",
    timezone: "Asia/Tokyo",
    birthDate: "2000-01-01",
    residenceCity: "検証市",
  };

  expect(
    (await request("/api/application-profile", email, profile)).status,
  ).toBe(200);
  expect(
    (
      await request("/api/apply", email, {
        projectSlug: "thinking-cafe",
        interests: "対話の場づくり",
        message: "応募から初回利用までの隔離検証",
        referralSource: "公式サイト",
        interviewAvailability: "平日18時 Asia/Tokyo",
        projectAnswers: { theme: "学び" },
      })
    ).status,
  ).toBe(201);

  const applicantStatus = await request("/api/user/status", email);
  expect(await applicantStatus.json()).toMatchObject({
    stage: "APPLICANT",
    applicationStatus: "new",
    access: { applicant: true, onboarding: false, admin: false },
  });
  const applicantSummary = await request("/api/applicant/me", email);
  expect(await applicantSummary.json()).toMatchObject({
    stage: "APPLICANT",
    basicProfileComplete: true,
    applications: [{ project: "考えるカフェ", status: "new" }],
  });
  expect((await request("/admin/member-calendar/", email)).status).toBe(302);

  const applicationId = db
    .prepare("SELECT id FROM atlasez_member_applications WHERE email=?")
    .get(email) as { id: string };
  for (const [fromState, toState, idempotencyKey] of [
    ["new", "reviewing", "journey-review-1"],
    ["reviewing", "accepted", "journey-accept-1"],
  ]) {
    const response = await request(
      "/api/admin/workflow/transition",
      "global@atlasez.test",
      {
        entityType: "application",
        entityId: applicationId.id,
        fromState,
        toState,
        idempotencyKey,
      },
    );
    expect(response.status, await response.clone().text()).toBe(200);
  }

  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM workflow_transition_events WHERE entity_id=?",
      )
      .get(applicationId.id),
  ).toEqual({ count: 2 });
  expect(
    db
      .prepare(
        "SELECT project_id,role FROM atlasez_project_memberships WHERE email=?",
      )
      .get(email),
  ).toEqual({ project_id: "thinking-cafe", role: "member" });
  expect((await request("/admin/member-calendar/", email)).status).toBe(302);
  expect(
    await (
      await request("/api/onboarding/me", email, {
        displayName: "検証メンバー",
        bio: "公開プロフィールの隔離テスト",
      })
    ).json(),
  ).toMatchObject({
    ok: true,
    stage: "ONBOARDING",
    next: "/onboarding/project/",
  });
  expect(
    await (
      await request("/api/onboarding/project", email, {
        internalBio: "プロジェクト内プロフィールの隔離テスト",
      })
    ).json(),
  ).toMatchObject({ ok: true, stage: "MEMBER", next: "/applicant/" });

  expect(await (await request("/api/user/status", email)).json()).toMatchObject(
    {
      stage: "MEMBER",
      applicationStatus: "accepted",
      applicationProjects: ["thinking-cafe"],
      access: { onboarding: false, admin: false },
    },
  );
  expect((await request("/admin/member-calendar/", email)).status).toBe(200);
  expect(
    db
      .prepare(
        "SELECT display_name,bio FROM editorial_member_profiles WHERE lower(email)=lower(?)",
      )
      .get(email),
  ).toEqual({
    display_name: "検証メンバー",
    bio: "公開プロフィールの隔離テスト",
  });
  expect(
    db
      .prepare(
        "SELECT internal_bio FROM editorial_project_member_profiles WHERE project_id='thinking-cafe' AND lower(email)=lower(?)",
      )
      .get(email),
  ).toEqual({ internal_bio: "プロジェクト内プロフィールの隔離テスト" });
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("仮応募者の見送り後は応募状況を確認でき、オンボーディングと会員利用を拒否する", async () => {
  const { db, request } = environment();
  const email = "rejected-journey@atlasez.test";
  const profile = {
    familyName: "見送り",
    givenName: "検証",
    familyNameKana: "みおくり",
    givenNameKana: "けんしょう",
    formLanguage: "ja",
    affiliationEmail: "school@atlasez.test",
    affiliationType: "大学",
    institution: "検証大学",
    grade: "B1",
    country: "日本",
    timezone: "Asia/Tokyo",
    birthDate: "2000-01-01",
    residenceCity: "検証市",
  };

  expect(
    (await request("/api/application-profile", email, profile)).status,
  ).toBe(200);
  expect(
    (
      await request("/api/apply", email, {
        projectSlug: "thinking-cafe",
        interests: "対話の場づくり",
        message: "不承認経路の隔離検証",
        referralSource: "公式サイト",
        interviewAvailability: "平日18時 Asia/Tokyo",
        projectAnswers: { theme: "学び" },
      })
    ).status,
  ).toBe(201);

  const applicationId = db
    .prepare("SELECT id FROM atlasez_member_applications WHERE email=?")
    .get(email) as { id: string };
  for (const [fromState, toState, idempotencyKey] of [
    ["new", "reviewing", "journey-reject-review-1"],
    ["reviewing", "rejected", "journey-reject-final-1"],
  ]) {
    const response = await request(
      "/api/admin/workflow/transition",
      "global@atlasez.test",
      {
        entityType: "application",
        entityId: applicationId.id,
        fromState,
        toState,
        idempotencyKey,
      },
    );
    expect(response.status, await response.clone().text()).toBe(200);
  }

  expect(await (await request("/api/user/status", email)).json()).toMatchObject(
    {
      stage: "APPLICANT",
      applicationStatus: "rejected",
      applicationProjects: [],
      access: {
        applicant: true,
        onboarding: false,
        admin: false,
      },
    },
  );
  expect(
    await (await request("/api/applicant/me", email)).json(),
  ).toMatchObject({
    stage: "APPLICANT",
    applications: [{ project: "考えるカフェ", status: "rejected" }],
  });
  expect((await request("/api/onboarding/me", email)).status).toBe(403);
  expect((await request("/admin/member-calendar/", email)).status).toBe(302);
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_project_memberships WHERE lower(email)=lower(?)",
      )
      .get(email),
  ).toEqual({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT from_state,to_state FROM workflow_transition_events WHERE entity_id=?",
      )
      .all(applicationId.id),
  ).toEqual(
    expect.arrayContaining([
      { from_state: "new", to_state: "reviewing" },
      { from_state: "reviewing", to_state: "rejected" },
    ]),
  );
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM workflow_transition_events WHERE entity_id=?",
      )
      .get(applicationId.id),
  ).toEqual({ count: 2 });
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});
