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
  // Integration fixtures exercise notification behavior with their own data;
  // keep the global inbox boundary open unless a test sets a specific cutoff.
  db.prepare(
    "UPDATE admin_notification_global_cutoff SET cleared_before=? WHERE singleton=1",
  ).run("1970-01-01T00:00:00.000Z");
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
    method?: string,
  ) =>
    worker.fetch(
      new Request(`https://admin.atlasez.test${path}`, {
        method: method ?? (body === undefined ? "GET" : "POST"),
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

function expectApplicationAuditToMinimizeIdentity(
  db: DatabaseSync,
  applicationId: string,
  applicantEmail: string,
  applicantName: string,
) {
  const rows = db
    .prepare(
      `SELECT target_id,target_label,summary,details_json
       FROM admin_audit_log
       WHERE action='workflow_transition' AND target_type='workflow' AND target_id=?`,
    )
    .all(applicationId) as Array<{
    target_id: string;
    target_label: string;
    summary: string;
    details_json: string;
  }>;

  expect(rows).toHaveLength(2);
  expect(rows.every((row) => row.target_id === applicationId)).toBe(true);
  expect(
    rows.every(
      (row) =>
        row.target_label === "応募" && row.summary === "応募の状態を変更",
    ),
  ).toBe(true);
  expect(JSON.stringify(rows)).not.toContain(applicantEmail);
  expect(JSON.stringify(rows)).not.toContain(applicantName);
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

it("canonical原稿と同じpathの更新案があっても未登録記事をcanonical原稿へ紐付ける", async () => {
  const { db, request, env } = environment();
  creatorAuditProfile(db);
  creatorAuditGithubFixture(env);
  const now = new Date().toISOString();
  const canonicalId = "a4a6c053-58c9-4c22-9df3-e4567720d3f5";
  const proposalId = "19383967-06dd-4407-95c8-09fcf7ee3e8c";
  const insert = db.prepare(
    `INSERT INTO editorial_documents
      (id,creator_kind,document_kind,base_document_id,source_article_id,subject,category,locale,slug,title,concept_id,body,status,created_by,updated_by,created_at,updated_at)
     VALUES (?,'organization',?,?,?,'mathematics','ring-theory','ja','ring-definition',?,'math.ring-theory.ring-definition','保持する原稿本文','draft','global@atlasez.test','global@atlasez.test',?,?)`,
  );
  insert.run(canonicalId, "canonical", null, null, "運営の正規原稿", now, now);
  insert.run(
    proposalId,
    "update-proposal",
    canonicalId,
    "ja-mathematics-ring-definition",
    "更新案",
    now,
    now,
  );

  const response = await request(
    "/api/admin/editor/catalog/register",
    "global@atlasez.test",
    creatorAuditArticle,
  );
  expect(response.status, await response.clone().text()).toBe(200);
  expect(await response.json()).toMatchObject({
    ok: true,
    registered: true,
    documentId: canonicalId,
  });
  expect(
    db
      .prepare("SELECT source_article_id FROM editorial_documents WHERE id=?")
      .get(canonicalId),
  ).toEqual({ source_article_id: "ja-mathematics-ring-definition" });
  expect(
    db
      .prepare("SELECT source_article_id FROM editorial_documents WHERE id=?")
      .get(proposalId),
  ).toEqual({ source_article_id: "ja-mathematics-ring-definition" });
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

it("現在の発生回に紐づくタスク通知の終端失敗だけを運営一覧へ返す", async () => {
  const { db, request } = environment();
  const now = "2026-10-12T01:00:00.000Z";
  const recipient = "global@atlasez.test";
  const taskId = "66666666-6666-4666-8666-666666666666";
  const otherTaskId = "77777777-7777-4777-8777-777777777777";
  const reminderId = "88888888-8888-4888-8888-888888888888";
  const currentOccurrence = "2026-10-12T00:00:00.000Z";
  db.prepare(
    `INSERT INTO editorial_tasks
       (id,project_id,subject,assignee_email,title,status,created_by,created_at,updated_at,reminder_email)
     VALUES (?,'atlas','mathematics',?,?,'open',?,?,?,?)`,
  ).run(taskId, recipient, "通知確認タスク", recipient, now, now, recipient);
  db.prepare(
    `INSERT INTO editorial_tasks
       (id,project_id,subject,assignee_email,title,status,created_by,created_at,updated_at)
     VALUES (?,'atlas','mathematics',?,?,'open',?,?,?)`,
  ).run(otherTaskId, recipient, "通常タスク", recipient, now, now);
  db.prepare(
    `INSERT INTO editorial_task_reminders
       (id,task_id,remind_at,remind_at_utc,timezone,label,created_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(
    reminderId,
    taskId,
    "2026-10-12T09:00",
    currentOccurrence,
    "Asia/Tokyo",
    "指定日時",
    now,
  );
  const insertAttempt = db.prepare(
    `INSERT INTO editorial_task_reminder_delivery_attempts
       (delivery_key,reminder_id,recipient_email,occurrence_at,occurrence_timezone,payload_json,
        provider_idempotency_key,status,attempt_count,next_attempt_at,retry_deadline_at,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,'failed',5,?,?,?,?)`,
  );
  insertAttempt.run(
    "failed-current",
    reminderId,
    recipient,
    currentOccurrence,
    "Asia/Tokyo",
    JSON.stringify({ to: [recipient], text: "private reminder body" }),
    "failed-current-key",
    now,
    now,
    now,
    now,
  );
  insertAttempt.run(
    "failed-old-occurrence",
    reminderId,
    recipient,
    "2026-10-11T00:00:00.000Z",
    "Asia/Tokyo",
    JSON.stringify({ to: [recipient], text: "stale private body" }),
    "failed-old-key",
    now,
    now,
    now,
    now,
  );

  const response = await request(
    "/api/admin/operations?project=atlas",
    recipient,
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const payload = (await response.json()) as {
    tasks: Array<Record<string, unknown>>;
  };
  expect(payload.tasks.find((task) => task.id === taskId)).toMatchObject({
    reminder_delivery_failed_count: 1,
    reminder_delivery_latest_failed_at: now,
  });
  expect(payload.tasks.find((task) => task.id === otherTaskId)).toMatchObject({
    reminder_delivery_failed_count: 0,
    reminder_delivery_latest_failed_at: null,
  });
  expect(JSON.stringify(payload)).not.toContain("private reminder body");
  expect(JSON.stringify(payload)).not.toContain("stale private body");
  expect(JSON.stringify(payload)).not.toContain("provider_idempotency_key");
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
  db.prepare(
    "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('thinking-cafe',?,'member',?)",
  ).run("member@atlasez.test", now);
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

it("同じ既存セッションでもreviewer降格後はAPI拒否し、期限切れsessionは401にする", async () => {
  const { db, env } = environment();
  const email = "stale-reviewer@atlasez.test";
  const token = "stale-reviewer-session";
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO report_admin_permissions(email,subject) VALUES (?,'mathematics')",
  ).run(email);
  db.prepare(
    "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('thinking-cafe',?,'manager',?)",
  ).run(email, now);
  const sessionHash = createHash("sha256").update(token).digest("hex");
  db.prepare(
    "INSERT INTO admin_auth_sessions(session_hash,email,expires_at,created_at) VALUES (?,?,?,?)",
  ).run(sessionHash, email, "2099-01-01T00:00:00.000Z", now);

  const requestApplications = () =>
    worker.fetch(
      new Request(
        "https://admin.atlasez.test/api/admin/applications?project=thinking-cafe",
        { headers: { cookie: `atlasez_admin_session=${token}` } },
      ),
      env as never,
    );

  expect((await requestApplications()).status).toBe(200);
  db.prepare(
    "UPDATE atlasez_project_memberships SET role='member' WHERE project_id='thinking-cafe' AND lower(email)=lower(?)",
  ).run(email);
  expect((await requestApplications()).status).toBe(403);
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM admin_auth_sessions WHERE session_hash=? AND expires_at>? ",
      )
      .get(sessionHash, new Date().toISOString()),
  ).toEqual({ count: 1 });

  db.prepare(
    "UPDATE admin_auth_sessions SET expires_at=? WHERE session_hash=?",
  ).run("2000-01-01T00:00:00.000Z", sessionHash);
  expect((await requestApplications()).status).toBe(401);
});

it("既存member sessionは所属休止後のmember-task APIから拒否される", async () => {
  const { db, env } = environment();
  const email = "stale-member@atlasez.test";
  const token = "stale-member-session";
  calendarAuditMember(db, email);
  const now = new Date().toISOString();
  const sessionHash = createHash("sha256").update(token).digest("hex");
  db.prepare(
    "INSERT INTO admin_auth_sessions(session_hash,email,expires_at,created_at) VALUES (?,?,?,?)",
  ).run(sessionHash, email, "2099-01-01T00:00:00.000Z", now);
  const requestMemberTasks = () =>
    worker.fetch(
      new Request("https://admin.atlasez.test/api/admin/member-tasks", {
        headers: { cookie: `atlasez_admin_session=${token}` },
      }),
      env as never,
    );

  expect((await requestMemberTasks()).status).toBe(200);
  db.prepare(
    `INSERT INTO atlasez_project_member_lifecycle
       (project_id,email,state,role_snapshot,last_request_id,updated_at)
     VALUES ('thinking-cafe',?,'paused','member','pause-review',?)`,
  ).run(email, now);
  expect((await requestMemberTasks()).status).toBe(403);
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM admin_auth_sessions WHERE session_hash=? AND expires_at>? ",
      )
      .get(sessionHash, new Date().toISOString()),
  ).toEqual({ count: 1 });
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
  const appliedResult = await applied.json();
  expect(appliedResult).toMatchObject({
    applicationCreated: true,
    responseTaskCreated: true,
    emailDeliveryStatus: "queued",
    emailProviderConfigured: false,
  });
  expect(appliedResult.emailQueueCount).toBeGreaterThan(0);
  expect(appliedResult).not.toHaveProperty("emailDelivered");
  const applicationId = String(
    db
      .prepare("SELECT id FROM atlasez_member_applications WHERE email=?")
      .get(email)?.id,
  );
  const responseTaskOutsiderUpdate = await request(
    `/api/admin/operations/tasks/${encodeURIComponent(`application-response:${applicationId}`)}`,
    "outsider@atlasez.test",
    { status: "done" },
    "https://admin.atlasez.test",
    "PATCH",
  );
  expect(responseTaskOutsiderUpdate.status).toBe(403);
  const responseTaskUpdate = await request(
    `/api/admin/operations/tasks/${encodeURIComponent(`application-response:${applicationId}`)}`,
    "global@atlasez.test",
    { status: "doing" },
    "https://admin.atlasez.test",
    "PATCH",
  );
  expect(
    responseTaskUpdate.status,
    await responseTaskUpdate.clone().text(),
  ).toBe(200);
  expect(
    db
      .prepare("SELECT status FROM editorial_tasks WHERE id=?")
      .get(`application-response:${applicationId}`),
  ).toEqual({ status: "doing" });
  const responseTaskCompletion = await request(
    `/api/admin/operations/tasks/${encodeURIComponent(`application-response:${applicationId}`)}`,
    "global@atlasez.test",
    { status: "done" },
    "https://admin.atlasez.test",
    "PATCH",
  );
  expect(responseTaskCompletion.status).toBe(200);
  const duplicate = await request("/api/apply", email, application);
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toMatchObject({
    code: "APPLICATION_ALREADY_EXISTS",
    statusUrl: "/applicant/?submission=already-received",
  });
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

it("同一利用者の同時応募は1件だけ保存し、副作用も一組だけ作る", async () => {
  const { db, request } = environment();
  const email = "concurrent-applicant@atlasez.test";
  const profile = {
    familyName: "同時",
    givenName: "応募",
    familyNameKana: "どうじ",
    givenNameKana: "おうぼ",
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
  const application = {
    projectSlug: "thinking-cafe",
    interests: "対話",
    message: "並行送信の隔離検証",
    referralSource: "検証用入力",
    interviewAvailability: "平日18時 Asia/Tokyo",
    projectAnswers: { theme: "運用検証" },
  };

  const responses = await Promise.all([
    request("/api/apply", email, application),
    request("/api/apply", email, application),
  ]);

  expect(responses.map((response) => response.status).sort()).toEqual([
    201, 409,
  ]);
  const duplicate = responses.find((response) => response.status === 409);
  expect(duplicate).toBeDefined();
  expect(await duplicate!.json()).toMatchObject({
    code: "APPLICATION_ALREADY_EXISTS",
    statusUrl: "/applicant/?submission=already-received",
  });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_member_applications WHERE lower(email)=lower(?) AND project_slug='thinking-cafe' AND status IN ('new','reviewing')",
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
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("応募保存後にHTTP応答だけが失われた再送は409となり、本人が既存状況を確認できる", async () => {
  const { db, request } = environment();
  const email = "lost-response@atlasez.test";
  const profile = {
    familyName: "応答",
    givenName: "喪失",
    familyNameKana: "おうとう",
    givenNameKana: "そうしつ",
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
  const application = {
    projectSlug: "thinking-cafe",
    interests: "対話の場づくり",
    message: "保存後に応答だけが失われるケース",
    referralSource: "隔離テスト",
    interviewAvailability: "平日18時 Asia/Tokyo",
    projectAnswers: { theme: "安全な再送" },
  };
  expect(
    (await request("/api/application-profile", email, profile)).status,
  ).toBe(200);

  const sendWithLostResponse = async () => {
    const committedResponse = await request("/api/apply", email, application);
    expect(committedResponse.status).toBe(201);
    await committedResponse.body?.cancel();
    throw new TypeError("simulated response loss after committed request");
  };
  await expect(sendWithLostResponse()).rejects.toThrow(TypeError);
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_member_applications WHERE lower(email)=lower(?) AND project_slug='thinking-cafe'",
      )
      .get(email),
  ).toEqual({ count: 1 });

  const retry = await request("/api/apply", email, application);
  expect(retry.status).toBe(409);
  expect(await retry.json()).toMatchObject({
    code: "APPLICATION_ALREADY_EXISTS",
    statusUrl: "/applicant/?submission=already-received",
  });
  const statusResponse = await request("/api/applicant/me", email);
  expect(statusResponse.status).toBe(200);
  expect(await statusResponse.json()).toMatchObject({
    stage: "APPLICANT",
    applications: [
      expect.objectContaining({ project: "考えるカフェ", status: "new" }),
    ],
  });

  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_member_applications WHERE lower(email)=lower(?) AND project_slug='thinking-cafe'",
      )
      .get(email),
  ).toEqual({ count: 1 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_tasks WHERE created_by='応募フォーム'",
      )
      .get(),
  ).toEqual({ count: 1 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries",
      )
      .get(),
  ).toEqual({ count: 2 });
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("D1 batchのcommit後にWorkerが応答を失ってもrollback済みと扱わず状態を照合する", async () => {
  const { db, request, env } = environment();
  const email = "batch-timeout-after-commit@atlasez.test";
  const profile = {
    familyName: "commit後",
    givenName: "応答消失",
    familyNameKana: "こみっとご",
    givenNameKana: "おうとうしょうしつ",
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
  const application = {
    projectSlug: "thinking-cafe",
    interests: "対話",
    message: "D1 commit後の応答消失を検証",
    referralSource: "隔離テスト",
    interviewAvailability: "平日18時 Asia/Tokyo",
    projectAnswers: { theme: "再試行" },
  };
  await request("/api/application-profile", email, profile);
  const originalBatch = env.REPORTS.batch;
  let loseFirstResponse = true;
  env.REPORTS.batch = async (statements) => {
    const results = await originalBatch(statements);
    if (loseFirstResponse) {
      loseFirstResponse = false;
      throw new Error("isolated response timeout after committed batch");
    }
    return results;
  };

  const uncertain = await request("/api/apply", email, application);
  expect(uncertain.status).toBe(503);
  expect(await uncertain.json()).toMatchObject({
    code: "APPLICATION_SETUP_REQUIRES_REVIEW",
    applicationSaved: true,
    applicationState: "saved",
    setupRepairStatus: "verified",
    operatorFollowupRecorded: true,
  });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_member_applications WHERE email=?",
      )
      .get(email),
  ).toEqual({ count: 1 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_tasks WHERE created_by='応募フォーム'",
      )
      .get(),
  ).toEqual({ count: 1 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries",
      )
      .get(),
  ).toEqual({ count: 2 });

  const retried = await request("/api/apply", email, application);
  expect(retried.status).toBe(409);
  expect(await retried.json()).toMatchObject({
    code: "APPLICATION_ALREADY_EXISTS",
    statusUrl: "/applicant/?submission=already-received",
  });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_member_applications WHERE email=?",
      )
      .get(email),
  ).toEqual({ count: 1 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries",
      )
      .get(),
  ).toEqual({ count: 2 });
});

it("commit後の保存確認read失敗はunknownとして返し、応募状況と409を安全に再確認できる", async () => {
  const { db, request, env } = environment();
  const email = "intake-read-unknown@atlasez.test";
  const profile = {
    familyName: "保存確認",
    givenName: "不明",
    familyNameKana: "ほぞんかくにん",
    givenNameKana: "ふめい",
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
  const application = {
    projectSlug: "thinking-cafe",
    interests: "対話",
    message: "保存結果のread失敗を検証",
    referralSource: "隔離テスト",
    interviewAvailability: "平日18時 Asia/Tokyo",
    projectAnswers: { theme: "unknown state" },
  };
  await request("/api/application-profile", email, profile);
  const originalPrepare = env.REPORTS.prepare.bind(env.REPORTS);
  let injectedFailures = 2;
  env.REPORTS.prepare = ((query: string) => {
    const statement = originalPrepare(query);
    if (!query.includes("AS application_exists") || injectedFailures <= 0)
      return statement;
    const first = statement.first.bind(statement);
    statement.first = async <T>() => {
      if (injectedFailures > 0) {
        injectedFailures -= 1;
        throw new Error("isolated intake read failure");
      }
      return first<T>();
    };
    return statement;
  }) as typeof env.REPORTS.prepare;

  const uncertain = await request("/api/apply", email, application);
  expect(uncertain.status).toBe(503);
  expect(await uncertain.json()).toMatchObject({
    code: "APPLICATION_RESULT_UNCONFIRMED",
    applicationSaved: false,
    applicationState: "unknown",
    statusUrl: "/applicant/?submission=check",
  });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_member_applications WHERE email=?",
      )
      .get(email),
  ).toEqual({ count: 1 });
  env.REPORTS.prepare = originalPrepare;

  const status = await request("/api/applicant/me", email);
  expect(status.status).toBe(200);
  expect(await status.json()).toMatchObject({
    applications: [
      expect.objectContaining({
        status: "new",
        intakeNeedsOperatorAttention: true,
      }),
    ],
  });
  const duplicate = await request("/api/apply", email, application);
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toMatchObject({
    code: "APPLICATION_ALREADY_EXISTS",
    statusUrl: "/applicant/?submission=already-received",
  });
});

it("運営通知先の設定変更では過去応募を誤検知せず、保存queueの欠損は検知する", async () => {
  const { db, request, env } = environment();
  const email = "operator-config-snapshot@atlasez.test";
  const profile = {
    familyName: "通知先",
    givenName: "固定",
    familyNameKana: "つうちさき",
    givenNameKana: "こてい",
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
  const application = {
    projectSlug: "thinking-cafe",
    interests: "対話",
    message: "応募時点の通知先を確認",
    referralSource: "隔離テスト",
    interviewAvailability: "平日18時 Asia/Tokyo",
    projectAnswers: { theme: "snapshot" },
  };
  await request("/api/application-profile", email, profile);
  const submitted = await request("/api/apply", email, application);
  expect(submitted.status).toBe(201);
  expect(await submitted.json()).toMatchObject({
    applicationState: "saved",
    responseTaskCreated: true,
    emailQueueCount: 2,
    emailDeliveryStatus: "queued",
  });
  expect(
    db
      .prepare(
        "SELECT operator_notification_recipients_json FROM atlasez_member_applications WHERE email=?",
      )
      .get(email),
  ).toEqual({
    operator_notification_recipients_json: '["operator@atlasez.test"]',
  });

  env.APPLICATION_OPERATIONS_EMAILS = "replacement-operator@atlasez.test";
  const stillComplete = await request("/api/applicant/me", email);
  const stillCompleteBody = await stillComplete.text();
  expect(stillComplete.status).toBe(200);
  expect(stillCompleteBody).not.toContain("operator@atlasez.test");
  expect(JSON.parse(stillCompleteBody)).toMatchObject({
    applications: [
      expect.objectContaining({
        intakeVerificationStatus: "verified",
        intakeNeedsOperatorAttention: false,
      }),
    ],
  });

  db.prepare(
    "DELETE FROM atlasez_application_email_deliveries WHERE application_id=(SELECT id FROM atlasez_member_applications WHERE email=?) AND kind='operator_notification'",
  ).run(email);
  const missingQueue = await request("/api/applicant/me", email);
  expect(JSON.parse(await missingQueue.text())).toMatchObject({
    applications: [
      expect.objectContaining({
        intakeVerificationStatus: "attention_required",
        intakeNeedsOperatorAttention: true,
      }),
    ],
  });
  db.prepare(
    "UPDATE atlasez_member_applications SET intake_reconciliation_required=1,created_at=? WHERE email=?",
  ).run(new Date(Date.now() - 10 * 60_000).toISOString(), email);
  const scheduledWork: Promise<unknown>[] = [];
  await worker.scheduled?.({ cron: "*/5 * * * *" }, env as never, {
    waitUntil: (promise) => scheduledWork.push(promise),
  });
  await Promise.all(scheduledWork);
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries WHERE kind='operator_notification'",
      )
      .get(),
  ).toEqual({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT intake_reconciliation_required FROM atlasez_member_applications WHERE email=?",
      )
      .get(email),
  ).toEqual({ intake_reconciliation_required: 1 });
  expect(
    JSON.parse(await (await request("/api/applicant/me", email)).text()),
  ).toMatchObject({
    applications: [
      expect.objectContaining({
        intakeVerificationStatus: "attention_required",
        intakeNeedsOperatorAttention: true,
      }),
    ],
  });
});

it("破損した応募時通知先snapshotと欠落queueをlegacy扱いせず要対応として返す", async () => {
  const { db, request } = environment();
  const email = "corrupt-recipient-snapshot@atlasez.test";
  const profile = {
    familyName: "通知先",
    givenName: "snapshot破損",
    familyNameKana: "つうちさき",
    givenNameKana: "はそん",
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
  await request("/api/application-profile", email, profile);
  const submitted = await request("/api/apply", email, {
    projectSlug: "thinking-cafe",
    interests: "対話",
    message: "通知先snapshotの整合性を検証",
    referralSource: "隔離テスト",
    interviewAvailability: "平日18時 Asia/Tokyo",
    projectAnswers: { theme: "snapshot integrity" },
  });
  expect(submitted.status).toBe(201);
  const applicationId = db
    .prepare(
      "SELECT id FROM atlasez_member_applications WHERE lower(email)=lower(?) AND project_slug='thinking-cafe'",
    )
    .get(email) as { id: string };
  db.prepare(
    "UPDATE atlasez_member_applications SET operator_notification_recipients_json='not-json' WHERE id=?",
  ).run(applicationId.id);
  db.prepare(
    "DELETE FROM atlasez_application_email_deliveries WHERE application_id=? AND kind='operator_notification'",
  ).run(applicationId.id);

  const status = await request("/api/applicant/me", email);
  expect(status.status).toBe(200);
  expect(await status.json()).toMatchObject({
    applications: [
      expect.objectContaining({
        intakeVerificationStatus: "attention_required",
        intakeNeedsOperatorAttention: true,
      }),
    ],
  });
});

it("applicant status reports a permanently failed applicant notification", async () => {
  const { db, request } = environment();
  const email = "failed-notification-status@atlasez.test";
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO atlasez_member_applications
      (id,name,email,interests,message,status,created_at,updated_at)
     VALUES ('failed-notification-app','Synthetic applicant',?,'test','test','new',?,?)`,
  ).run(email, now, now);
  db.prepare(
    `INSERT INTO atlasez_application_email_deliveries
      (id,application_id,recipient_email,kind,subject,text_body,html_body,status,
       attempt_count,next_attempt_at,created_at,updated_at)
     VALUES ('failed-confirmation','failed-notification-app',?,'applicant_confirmation',
       'synthetic subject','synthetic body','<p>synthetic</p>','failed',3,?,?,?)`,
  ).run(email, now, now, now);

  const response = await request("/api/applicant/me", email);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    applications: [
      expect.objectContaining({
        applicantNotificationFailed: true,
      }),
    ],
  });
});

it("実SQLのRAISE(IGNORE)で応募だけcommitしたbatchを検知して冪等修復し運営へ記録する", async () => {
  const { db, request, env } = environment();
  const email = "write-count-mismatch@atlasez.test";
  const profile = {
    familyName: "変更数",
    givenName: "不整合",
    familyNameKana: "へんこうすう",
    givenNameKana: "ふせいごう",
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
  const application = {
    projectSlug: "thinking-cafe",
    interests: "対話",
    message: "変更数整合性を確認",
    referralSource: "隔離テスト",
    interviewAvailability: "平日18時 Asia/Tokyo",
    projectAnswers: { theme: "データ整合性" },
  };
  await request("/api/application-profile", email, profile);
  const logger = vi.spyOn(console, "error").mockImplementation(() => {});
  const originalBatch = env.REPORTS.batch;
  let batchSnapshot: {
    applications: number;
    responseTasks: number;
    emailQueue: number;
  } | null = null;
  let injected = false;
  env.REPORTS.batch = async (statements) => {
    if (injected) return originalBatch(statements);
    injected = true;
    db.exec(`
      CREATE TRIGGER isolate_ignore_intake_response_task
      BEFORE INSERT ON editorial_tasks
      WHEN NEW.created_by='応募フォーム'
      BEGIN SELECT RAISE(IGNORE); END;
      CREATE TRIGGER isolate_ignore_applicant_confirmation
      BEFORE INSERT ON atlasez_application_email_deliveries
      WHEN NEW.kind='applicant_confirmation'
      BEGIN SELECT RAISE(IGNORE); END;
      CREATE TRIGGER isolate_ignore_operator_notification
      BEFORE INSERT ON atlasez_application_email_deliveries
      WHEN NEW.kind='operator_notification'
      BEGIN SELECT RAISE(IGNORE); END;
    `);
    try {
      const results = await originalBatch(statements);
      batchSnapshot = {
        applications: Number(
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM atlasez_member_applications WHERE email=?",
            )
            .get(email)?.count ?? 0,
        ),
        responseTasks: Number(
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM editorial_tasks WHERE created_by='応募フォーム'",
            )
            .get()?.count ?? 0,
        ),
        emailQueue: Number(
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries",
            )
            .get()?.count ?? 0,
        ),
      };
      return results;
    } finally {
      db.exec(`
        DROP TRIGGER isolate_ignore_intake_response_task;
        DROP TRIGGER isolate_ignore_applicant_confirmation;
        DROP TRIGGER isolate_ignore_operator_notification;
      `);
    }
  };

  const response = await request("/api/apply", email, application);
  expect(response.status).toBe(503);
  const result = (await response.json()) as {
    code: string;
    correlationId: string;
    statusUrl: string;
    applicationSaved: boolean;
    setupRepairStatus: string;
    operatorFollowupRecorded: boolean;
  };
  expect(result).toMatchObject({
    code: "APPLICATION_SETUP_REQUIRES_REVIEW",
    applicationSaved: true,
    setupRepairStatus: "repaired",
    operatorFollowupRecorded: true,
    statusUrl: "/applicant/?submission=check",
  });
  expect(batchSnapshot).toEqual({
    applications: 1,
    responseTasks: 0,
    emailQueue: 0,
  });
  expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(logger).toHaveBeenCalledTimes(1);
  const logLine = String(logger.mock.calls[0]?.[0]);
  expect(logLine).toContain(result.correlationId);
  expect(logLine).toContain("application_write_count_mismatch");
  expect(logLine).toContain('"responseTaskCount":1');
  expect(logLine).toContain('"applicantConfirmationCount":1');
  expect(logLine).not.toContain(result.correlationId.replaceAll("-", ""));
  expect(logLine).not.toContain(email);
  expect(logLine).not.toContain("変更数整合性");
  expect(logLine).not.toContain("検証");
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_member_applications WHERE email=?",
      )
      .get(email),
  ).toEqual({ count: 1 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_tasks WHERE created_by='応募フォーム'",
      )
      .get(),
  ).toEqual({ count: 1 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries",
      )
      .get(),
  ).toEqual({ count: 2 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_tasks WHERE id LIKE 'application-recovery:%'",
      )
      .get(),
  ).toEqual({ count: 1 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM admin_audit_log WHERE action='application_intake_reconciliation_required'",
      )
      .get(),
  ).toEqual({ count: 1 });
  const status = await request("/api/applicant/me", email);
  expect(status.status).toBe(200);
  expect(await status.json()).toMatchObject({
    applications: [
      expect.objectContaining({ intakeNeedsOperatorAttention: true }),
    ],
  });
  const duplicate = await request("/api/apply", email, application);
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toMatchObject({
    code: "APPLICATION_ALREADY_EXISTS",
    statusUrl: "/applicant/?submission=already-received",
  });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_tasks WHERE id LIKE 'application-recovery:%'",
      )
      .get(),
  ).toEqual({ count: 1 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM admin_audit_log WHERE action='application_intake_reconciliation_required'",
      )
      .get(),
  ).toEqual({ count: 1 });
});

it("補完と復旧記録がともに失敗してもCron照合が欠損を修復し送信済みメールを再送しない", async () => {
  const { db, request, env } = environment();
  const email = "intake-cron-repair@atlasez.test";
  const profile = {
    familyName: "継続照合",
    givenName: "検証",
    familyNameKana: "けいぞくしょうごう",
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
  const application = {
    projectSlug: "thinking-cafe",
    interests: "対話",
    message: "継続照合を検証",
    referralSource: "隔離テスト",
    interviewAvailability: "平日18時 Asia/Tokyo",
    projectAnswers: { theme: "idempotent repair" },
  };
  await request("/api/application-profile", email, profile);
  const logger = vi.spyOn(console, "error").mockImplementation(() => {});
  const originalBatch = env.REPORTS.batch;
  let injected = false;
  env.REPORTS.batch = async (statements) => {
    if (injected) return originalBatch(statements);
    injected = true;
    db.exec(`
      CREATE TRIGGER isolate_ignore_intake_task
      BEFORE INSERT ON editorial_tasks
      WHEN NEW.created_by IN ('応募フォーム','応募処理監視')
      BEGIN SELECT RAISE(IGNORE); END;
      CREATE TRIGGER isolate_ignore_operator_email
      BEFORE INSERT ON atlasez_application_email_deliveries
      WHEN NEW.kind='operator_notification'
      BEGIN SELECT RAISE(IGNORE); END;
      CREATE TRIGGER isolate_ignore_recovery_audit
      BEFORE INSERT ON admin_audit_log
      WHEN NEW.action='application_intake_reconciliation_required'
      BEGIN SELECT RAISE(IGNORE); END;
    `);
    return originalBatch(statements);
  };

  const response = await request("/api/apply", email, application);
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    code: "APPLICATION_SETUP_REQUIRES_REVIEW",
    applicationSaved: true,
    applicationState: "saved",
    setupRepairStatus: "operator_action_required",
    operatorFollowupRecorded: false,
  });
  const row = db
    .prepare(
      "SELECT id,intake_reconciliation_required FROM atlasez_member_applications WHERE email=?",
    )
    .get(email) as { id: string; intake_reconciliation_required: number };
  expect(row.intake_reconciliation_required).toBe(1);
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_tasks WHERE created_by='応募フォーム'",
      )
      .get(),
  ).toEqual({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries WHERE kind='operator_notification'",
      )
      .get(),
  ).toEqual({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM admin_audit_log WHERE action='application_intake_reconciliation_required'",
      )
      .get(),
  ).toEqual({ count: 0 });
  const operatorView = await request(
    "/api/admin/applications?project=thinking-cafe",
    "global@atlasez.test",
  );
  expect(operatorView.status).toBe(200);
  expect(await operatorView.json()).toMatchObject({
    applications: [
      expect.objectContaining({
        intake_reconciliation_required: true,
        intake_recovery_task_open: false,
      }),
    ],
  });
  expect(
    db
      .prepare(
        "SELECT status FROM atlasez_application_email_deliveries WHERE application_id=? AND kind='applicant_confirmation'",
      )
      .get(row.id),
  ).toEqual({ status: "pending" });

  db.exec(`
    DROP TRIGGER isolate_ignore_intake_task;
    DROP TRIGGER isolate_ignore_operator_email;
    DROP TRIGGER isolate_ignore_recovery_audit;
  `);
  db.prepare(
    "UPDATE atlasez_member_applications SET created_at=?,updated_at=? WHERE id=?",
  ).run(
    new Date(Date.now() - 10 * 60_000).toISOString(),
    new Date(Date.now() - 10 * 60_000).toISOString(),
    row.id,
  );
  db.prepare(
    "UPDATE atlasez_application_email_deliveries SET status='sent',sent_at=?,attempt_count=1 WHERE application_id=? AND kind='applicant_confirmation'",
  ).run(new Date().toISOString(), row.id);

  const scheduledWork: Promise<unknown>[] = [];
  await worker.scheduled?.({ cron: "*/5 * * * *" }, env as never, {
    waitUntil: (promise) => scheduledWork.push(promise),
  });
  await Promise.all(scheduledWork);

  expect(
    db
      .prepare(
        "SELECT intake_reconciliation_required FROM atlasez_member_applications WHERE id=?",
      )
      .get(row.id),
  ).toEqual({ intake_reconciliation_required: 0 });
  expect(
    db
      .prepare(
        "SELECT status,attempt_count FROM atlasez_application_email_deliveries WHERE application_id=? AND kind='applicant_confirmation'",
      )
      .get(row.id),
  ).toEqual({ status: "sent", attempt_count: 1 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries WHERE application_id=?",
      )
      .get(row.id),
  ).toEqual({ count: 2 });
  expect(
    db
      .prepare("SELECT COUNT(*) AS count FROM editorial_tasks WHERE id=?")
      .get(`application-response:${row.id}`),
  ).toEqual({ count: 1 });
  expect(
    db
      .prepare("SELECT status FROM editorial_tasks WHERE id=?")
      .get(`application-recovery:${row.id}`),
  ).toEqual({ status: "open" });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM admin_audit_log WHERE action='application_intake_reconciliation_required' AND target_id=?",
      )
      .get(row.id),
  ).toEqual({ count: 1 });
  const reconciledOperatorView = await request(
    "/api/admin/applications?project=thinking-cafe",
    "global@atlasez.test",
  );
  expect(await reconciledOperatorView.json()).toMatchObject({
    applications: [
      expect.objectContaining({
        intake_reconciliation_required: false,
        intake_recovery_task_open: true,
      }),
    ],
  });
  const recoveryTaskUpdate = await request(
    `/api/admin/operations/tasks/${encodeURIComponent(`application-recovery:${row.id}`)}`,
    "global@atlasez.test",
    { status: "doing" },
    "https://admin.atlasez.test",
    "PATCH",
  );
  expect(
    recoveryTaskUpdate.status,
    await recoveryTaskUpdate.clone().text(),
  ).toBe(200);
  const recoveryTaskCompletion = await request(
    `/api/admin/operations/tasks/${encodeURIComponent(`application-recovery:${row.id}`)}`,
    "global@atlasez.test",
    { status: "done" },
    "https://admin.atlasez.test",
    "PATCH",
  );
  expect(recoveryTaskCompletion.status).toBe(200);
  const applicantStatus = await request("/api/applicant/me", email);
  expect(await applicantStatus.json()).toMatchObject({
    applications: [
      expect.objectContaining({ intakeNeedsOperatorAttention: false }),
    ],
  });
  expect(
    logger.mock.calls.map((call) => String(call[0])).join("\n"),
  ).not.toContain(email);
  const serializedRecoveryLogs = logger.mock.calls
    .map((call) => String(call[0]))
    .join("\n");
  expect(serializedRecoveryLogs).not.toContain(row.id);
  expect(serializedRecoveryLogs).not.toContain("継続照合");
  expect(serializedRecoveryLogs).not.toContain("検証");

  const retried = await request("/api/apply", email, application);
  expect(retried.status).toBe(409);
  expect(await retried.json()).toMatchObject({
    code: "APPLICATION_ALREADY_EXISTS",
    statusUrl: "/applicant/?submission=already-received",
  });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries WHERE application_id=?",
      )
      .get(row.id),
  ).toEqual({ count: 2 });
});

it("復旧記録を作れない古い行が25件上限を占有せず次回Cronで後続行も照合する", async () => {
  const { db, env } = environment();
  const logger = vi.spyOn(console, "error").mockImplementation(() => {});
  const oldTimestamp = new Date(Date.now() - 10 * 60_000).toISOString();
  const insert = db.prepare(
    `INSERT INTO atlasez_member_applications
       (id,name,email,interests,message,status,created_at,updated_at,project_slug,
        operator_notification_recipients_json,intake_reconciliation_required)
     VALUES (?,? ,?,'検証','再試行待ち','new',?,?,'thinking-cafe','[]',1)`,
  );
  for (let index = 0; index < 26; index += 1) {
    const suffix = String(index).padStart(2, "0");
    insert.run(
      `intake-rotation-${suffix}`,
      "継続照合テスト",
      `rotation-${suffix}@atlasez.test`,
      oldTimestamp,
      oldTimestamp,
    );
  }
  db.exec(`
    CREATE TRIGGER isolate_ignore_recovery_task
    BEFORE INSERT ON editorial_tasks
    WHEN NEW.created_by='応募処理監視'
    BEGIN SELECT RAISE(IGNORE); END;
    CREATE TRIGGER isolate_ignore_recovery_audit
    BEFORE INSERT ON admin_audit_log
    WHEN NEW.action='application_intake_reconciliation_required'
    BEGIN SELECT RAISE(IGNORE); END;
  `);

  const runReconciliationCron = async () => {
    const scheduledWork: Promise<unknown>[] = [];
    await worker.scheduled?.({ cron: "*/5 * * * *" }, env as never, {
      waitUntil: (promise) => scheduledWork.push(promise),
    });
    await Promise.all(scheduledWork);
  };
  await runReconciliationCron();
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_member_applications WHERE intake_reconciliation_required=1 AND updated_at>?",
      )
      .get(oldTimestamp),
  ).toEqual({ count: 25 });
  await runReconciliationCron();

  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_member_applications WHERE intake_reconciliation_required=1 AND updated_at>?",
      )
      .get(oldTimestamp),
  ).toEqual({ count: 26 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_tasks WHERE created_by='応募フォーム'",
      )
      .get(),
  ).toEqual({ count: 26 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries WHERE kind='applicant_confirmation'",
      )
      .get(),
  ).toEqual({ count: 26 });
  const serializedLogs = logger.mock.calls
    .map((call) => String(call[0]))
    .join("\n");
  expect(serializedLogs).not.toContain("rotation-00@atlasez.test");
  expect(serializedLogs).not.toContain("rotation-25@atlasez.test");
  expect(serializedLogs).not.toContain("intake-rotation-");
});

it("応募INSERTが実SQLで無視された全件0変更を二重応募409と誤認しない", async () => {
  const { db, request, env } = environment();
  const email = "ignored-application-insert@atlasez.test";
  const profile = {
    familyName: "応募",
    givenName: "未保存",
    familyNameKana: "おうぼ",
    givenNameKana: "みほぞん",
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
  const application = {
    projectSlug: "thinking-cafe",
    interests: "対話",
    message: "応募行が作成されない場合を検証",
    referralSource: "隔離テスト",
    interviewAvailability: "平日18時 Asia/Tokyo",
    projectAnswers: { theme: "保存確認" },
  };
  await request("/api/application-profile", email, profile);
  const originalBatch = env.REPORTS.batch;
  let injected = false;
  env.REPORTS.batch = async (statements) => {
    if (injected) return originalBatch(statements);
    injected = true;
    db.exec(`
      CREATE TRIGGER isolate_ignore_application_insert
      BEFORE INSERT ON atlasez_member_applications
      BEGIN SELECT RAISE(IGNORE); END;
    `);
    try {
      return await originalBatch(statements);
    } finally {
      db.exec("DROP TRIGGER isolate_ignore_application_insert");
    }
  };

  const response = await request("/api/apply", email, application);
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    code: "APPLICATION_RESULT_UNCONFIRMED",
    applicationSaved: false,
    statusUrl: "/applicant/?submission=check",
  });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_member_applications WHERE email=?",
      )
      .get(email),
  ).toEqual({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_tasks WHERE created_by='応募フォーム'",
      )
      .get(),
  ).toEqual({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries",
      )
      .get(),
  ).toEqual({ count: 0 });
});

it("応募・運営対応タスク・メールキューを同じbatchで確定し、失敗時は再応募可能にする", async () => {
  const { db, request, env } = environment();
  const email = "application-rollback@atlasez.test";
  const profile = {
    familyName: "隔離",
    givenName: "応募",
    familyNameKana: "かくり",
    givenNameKana: "おうぼ",
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
  const application = {
    projectSlug: "thinking-cafe",
    interests: "対話",
    message: "応募関連の一括確定を検証",
    referralSource: "隔離テスト",
    interviewAvailability: "平日18時 Asia/Tokyo",
    projectAnswers: { theme: "運用" },
  };
  expect(
    (await request("/api/application-profile", email, profile)).status,
  ).toBe(200);

  const originalBatch = env.REPORTS.batch;
  let injectFailure = true;
  env.REPORTS.batch = async (statements) => {
    const taskStatement = statements.find((statement) =>
      statement.query.includes("INSERT INTO editorial_tasks"),
    );
    if (injectFailure && taskStatement) {
      injectFailure = false;
      taskStatement.run = async () => {
        throw new Error("isolated task insert failure");
      };
    }
    return originalBatch(statements);
  };

  const failed = await request("/api/apply", email, application);
  expect(failed.status).toBe(503);
  expect(await failed.json()).not.toHaveProperty("ok");
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_member_applications WHERE email=?",
      )
      .get(email),
  ).toEqual({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_tasks WHERE created_by='応募フォーム'",
      )
      .get(),
  ).toEqual({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries",
      )
      .get(),
  ).toEqual({ count: 0 });

  const retried = await request("/api/apply", email, application);
  expect(retried.status, await retried.clone().text()).toBe(201);
  const result = await retried.json();
  expect(result).toMatchObject({
    responseTaskCreated: true,
    emailProviderConfigured: false,
  });
  expect(result.emailQueued).toBe(true);
  expect(result.emailQueueCount).toBeGreaterThan(0);
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_member_applications WHERE email=?",
      )
      .get(email),
  ).toEqual({ count: 1 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_tasks WHERE created_by='応募フォーム'",
      )
      .get(),
  ).toEqual({ count: 1 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries",
      )
      .get(),
  ).toEqual({ count: result.emailQueueCount });
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("参加済みメンバーは追加応募や二つ目の未入力プロフィールで会員アクセスを失わない", async () => {
  const { db, request } = environment();
  const managerProfile = await request(
    "/api/admin/profile",
    "global@atlasez.test",
  );
  expect(managerProfile.status).toBe(200);
  expect(await managerProfile.json()).toMatchObject({
    isManager: true,
    roles: ["全分野管理者"],
  });
  const email = "established@atlasez.test";
  calendarAuditMember(db, email);
  const later = "2098-01-01T00:00:00.000Z";
  db.prepare(
    "INSERT INTO atlasez_member_applications(id,name,email,interests,message,status,created_at,updated_at,project_slug) VALUES (?,?,?,?,?,'new',?,?,'secretariat')",
  ).run(
    "second-application",
    "参加済みメンバー",
    email,
    "運営",
    "追加応募",
    later,
    later,
  );
  expect(await (await request("/api/user/status", email)).json()).toMatchObject(
    {
      stage: "MEMBER",
      applicationStatus: "new",
      access: { onboarding: false, admin: false },
    },
  );
  expect((await request("/admin/portal/", email)).status).toBe(200);
  for (const status of ["reviewing", "rejected"]) {
    db.prepare(
      "UPDATE atlasez_member_applications SET status=? WHERE id='second-application'",
    ).run(status);
    expect(
      await (await request("/api/user/status", email)).json(),
    ).toMatchObject({
      stage: "MEMBER",
      applicationStatus: status,
    });
    expect((await request("/admin/portal/", email)).status).toBe(200);
  }
  db.prepare(
    "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('secretariat',?,'member',?)",
  ).run(email, later);
  db.prepare(
    "UPDATE atlasez_member_applications SET status='accepted' WHERE id='second-application'",
  ).run();
  expect(await (await request("/api/user/status", email)).json()).toMatchObject(
    {
      stage: "MEMBER",
      applicationStatus: "accepted",
    },
  );
  expect((await request("/api/admin/member-tasks", email)).status).toBe(200);
  expect((await request("/api/admin/permissions", email)).status).toBe(403);
});

it("既存会員の別プロジェクト応募を受け入れても既存所属を維持する", async () => {
  const { db, request } = environment();
  const email = "multi-project-journey@atlasez.test";
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO atlasez_member_applications
      (id,name,email,interests,message,status,created_at,updated_at,project_slug)
     VALUES ('existing-atlas-application','既存会員',?,'学習','既存所属','accepted',?,?,'atlas')`,
  ).run(email, now, now);
  db.prepare(
    "INSERT INTO editorial_member_profiles(email,display_name,bio,updated_at) VALUES (?,?,?,?)",
  ).run(email, "既存会員", "運営外プロフィール", now);
  db.prepare(
    "INSERT INTO editorial_project_member_profiles(project_id,email,internal_bio,updated_at) VALUES ('atlas',?,?,?)",
  ).run(email, "Atlas内プロフィール", now);
  db.prepare(
    "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('atlas',?,'member',?)",
  ).run(email, now);

  const profile = {
    familyName: "複数",
    givenName: "所属",
    familyNameKana: "ふくすう",
    givenNameKana: "しょぞく",
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
        message: "別プロジェクトへの応募",
        referralSource: "メンバー向け案内",
        interviewAvailability: "平日18時 Asia/Tokyo",
        projectAnswers: { theme: "学び" },
      })
    ).status,
  ).toBe(201);
  expect(
    db
      .prepare(
        "SELECT project_id FROM atlasez_project_memberships WHERE lower(email)=lower(?) ORDER BY project_id",
      )
      .all(email),
  ).toEqual([{ project_id: "atlas" }]);

  const application = db
    .prepare(
      "SELECT id FROM atlasez_member_applications WHERE lower(email)=lower(?) AND project_slug='thinking-cafe'",
    )
    .get(email) as { id: string };
  for (const [fromState, toState, idempotencyKey] of [
    ["new", "reviewing", "multi-project-review"],
    ["reviewing", "accepted", "multi-project-accept"],
  ]) {
    const response = await request(
      "/api/admin/workflow/transition",
      "global@atlasez.test",
      {
        entityType: "application",
        entityId: application.id,
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
        "SELECT project_id,role FROM atlasez_project_memberships WHERE lower(email)=lower(?) ORDER BY project_id",
      )
      .all(email),
  ).toEqual([
    { project_id: "atlas", role: "member" },
    { project_id: "thinking-cafe", role: "member" },
  ]);
  const memberStatusResponse = await request("/api/user/status", email);
  const memberStatusData = (await memberStatusResponse.json()) as {
    stage: string;
    applicationProjects: string[];
  };
  expect(memberStatusData).toMatchObject({ stage: "MEMBER" });
  expect(memberStatusData.applicationProjects).toEqual(
    expect.arrayContaining(["atlas", "thinking-cafe"]),
  );
  expect(memberStatusData.applicationProjects).toHaveLength(2);
  expect((await request("/admin/portal/", email)).status).toBe(200);
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("受入応募の個人情報を削除しても現在の所属とプロフィールで会員利用を継続できる", async () => {
  const { db, request } = environment();
  const email = "retained-membership@atlasez.test";
  calendarAuditMember(db, email);
  db.prepare("DELETE FROM atlasez_member_applications WHERE email=?").run(
    email,
  );
  expect(await (await request("/api/user/status", email)).json()).toMatchObject(
    {
      stage: "MEMBER",
      applicationStatus: null,
      applicationProjects: ["thinking-cafe"],
    },
  );
  expect((await request("/admin/portal/", email)).status).toBe(200);
  expect((await request("/api/admin/member-calendar", email)).status).toBe(200);
  expect((await request("/api/admin/permissions", email)).status).toBe(403);
});

it("所属削除後は過去の受入応募とプロフィールから会員権限を復活させない", async () => {
  const { db, request } = environment();
  const email = "former-member@atlasez.test";
  calendarAuditMember(db, email);
  db.prepare("DELETE FROM atlasez_project_memberships WHERE email=?").run(
    email,
  );
  expect(await (await request("/api/user/status", email)).json()).toMatchObject(
    {
      stage: "APPLICANT",
      applicationStatus: "accepted",
      access: { onboarding: false, admin: false },
    },
  );
  expect((await request("/admin/portal/", email)).status).toBe(302);
  expect((await request("/api/admin/member-tasks", email)).status).toBe(403);
  expect(
    (
      await request("/api/onboarding/project", email, {
        internalBio: "再登録しない",
      })
    ).status,
  ).toBe(403);
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_project_memberships WHERE email=?",
      )
      .get(email),
  ).toEqual({ count: 0 });
});

it("アトラスのアーカイブ済み所属を利用せず別プロジェクトの参加は維持する", async () => {
  const { db, request } = environment();
  const email = "archived-atlas@atlasez.test";
  calendarAuditMember(db, email);
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('atlas',?,'member',?)",
  ).run(email, now);
  db.prepare(
    "INSERT INTO editorial_project_member_profiles(project_id,email,internal_bio,updated_at) VALUES ('atlas',?,?,?)",
  ).run(email, "旧アトラス自己紹介", now);
  db.prepare(
    "INSERT INTO admin_member_lifecycle(email,status,snapshot_json,created_by,created_at,updated_by,updated_at) VALUES (?,'archived','{}','global@atlasez.test',?,'global@atlasez.test',?)",
  ).run(email, now, now);
  expect(await (await request("/api/user/status", email)).json()).toMatchObject(
    { stage: "MEMBER" },
  );
  expect((await request("/admin/portal/", email)).status).toBe(200);
  const activeProjects = await request("/api/admin/member-tasks", email);
  expect(activeProjects.status).toBe(200);
  const activeProjectData = (await activeProjects.json()) as {
    projects: Array<{ id: string }>;
  };
  expect(activeProjectData.projects.map((project) => project.id)).toEqual([
    "thinking-cafe",
  ]);
  const portal = await request("/api/admin/portal", email);
  expect(portal.status).toBe(200);
  expect(
    ((await portal.json()) as { projects: Array<{ id: string }> }).projects.map(
      (project) => project.id,
    ),
  ).toEqual(["thinking-cafe"]);
  const archivedTaskId = "33333333-3333-4333-8333-333333333333";
  db.prepare(
    "INSERT INTO editorial_tasks(id,project_id,assignee_email,title,status,created_by,created_at,updated_at) VALUES (?,'atlas',?,'旧所属タスク','open','global@atlasez.test',?,?)",
  ).run(archivedTaskId, email, now, now);
  const inaccessibleWorkspace = await request(
    `/api/admin/task-workspaces/${archivedTaskId}`,
    email,
  );
  // ワークスペースは存在を漏らさず、閲覧不可と不存在を同じ404で返す。
  expect(inaccessibleWorkspace.status).toBe(404);
  expect(await inaccessibleWorkspace.json()).toEqual({
    error: "タスクが見つからないか、閲覧できません。",
  });
  db.prepare(
    "UPDATE editorial_tasks SET project_id='thinking-cafe' WHERE id=?",
  ).run(archivedTaskId);
  expect(
    (await request(`/api/admin/task-workspaces/${archivedTaskId}`, email))
      .status,
  ).toBe(200);
  db.prepare(
    "DELETE FROM atlasez_project_memberships WHERE project_id='thinking-cafe' AND email=?",
  ).run(email);
  expect(await (await request("/api/user/status", email)).json()).toMatchObject(
    { stage: "APPLICANT" },
  );
  expect((await request("/api/admin/member-tasks", email)).status).toBe(403);
});

it("応募のないUUIDプロジェクト所属者が正しい所属先へ初回プロフィールを保存して活動開始できる", async () => {
  const { db, request } = environment();
  const email = "direct-project@atlasez.test";
  const projectId = "22222222-2222-4222-8222-222222222222";
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO atlasez_projects(id,slug,name,description,created_at) VALUES (?,'direct-project','直接参加プロジェクト','隔離検証',?)",
  ).run(projectId, now);
  db.prepare(
    "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES (?,?,'member',?)",
  ).run(projectId, email, now);
  expect(await (await request("/api/user/status", email)).json()).toMatchObject(
    { stage: "ONBOARDING", applicationStatus: null },
  );
  expect(
    await (await request("/api/onboarding/me", email)).json(),
  ).toMatchObject({ project: "直接参加プロジェクト" });
  const basic = await request("/api/onboarding/me", email, {
    displayName: "直接参加者",
    bio: "共通プロフィール",
  });
  expect(basic.status, await basic.clone().text()).toBe(200);
  expect(await basic.json()).toMatchObject({ next: "/onboarding/project/" });
  const project = await request("/api/onboarding/project", email, {
    internalBio: "所属プロジェクトの自己紹介",
    projectId: "atlas",
  });
  expect(project.status, await project.clone().text()).toBe(200);
  expect(await project.json()).toMatchObject({
    stage: "MEMBER",
    next: "/admin/portal/",
  });
  expect(
    db
      .prepare(
        "SELECT project_id,internal_bio FROM editorial_project_member_profiles WHERE email=?",
      )
      .all(email),
  ).toEqual([
    { project_id: projectId, internal_bio: "所属プロジェクトの自己紹介" },
  ]);
  expect(
    db
      .prepare(
        "SELECT project_id FROM atlasez_member_onboarding_progress WHERE email=?",
      )
      .all(email),
  ).toEqual([{ project_id: projectId }]);
  expect(await (await request("/api/user/status", email)).json()).toMatchObject(
    { stage: "MEMBER" },
  );
  expect((await request("/admin/portal/", email)).status).toBe(200);
  expect((await request("/api/admin/permissions", email)).status).toBe(403);
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_member_applications WHERE email=?",
      )
      .get(email),
  ).toEqual({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries",
      )
      .get(),
  ).toEqual({ count: 0 });
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
  expectApplicationAuditToMinimizeIdentity(
    db,
    applicationId.id,
    email,
    "実運用 検証",
  );
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
  ).toMatchObject({ ok: true, stage: "MEMBER", next: "/admin/portal/" });

  const firstTaskCreation = await request(
    "/api/admin/operations/tasks",
    "global@atlasez.test",
    {
      projectId: "thinking-cafe",
      assigneeEmail: email,
      title: "初回タスクの隔離検証",
      details: "メンバーが状態を更新して完了する。",
    },
  );
  expect(firstTaskCreation.status, await firstTaskCreation.clone().text()).toBe(
    200,
  );
  const firstTask = db
    .prepare(
      "SELECT id,status,updated_at FROM editorial_tasks WHERE assignee_email=? AND title='初回タスクの隔離検証'",
    )
    .get(email) as { id: string; status: string; updated_at: string };
  expect(firstTask.status).toBe("open");
  const memberTasks = await request("/api/admin/member-tasks?view=all", email);
  expect(memberTasks.status, await memberTasks.clone().text()).toBe(200);
  expect(await memberTasks.json()).toMatchObject({
    tasks: expect.arrayContaining([
      expect.objectContaining({
        id: firstTask.id,
        title: "初回タスクの隔離検証",
        can_update: true,
      }),
    ]),
  });
  let taskUpdatedAt = firstTask.updated_at;
  for (const [toState, idempotencyKey] of [
    ["doing", "onboarded-first-task-doing"],
    ["done", "onboarded-first-task-done"],
  ]) {
    const taskUpdate = await request(
      `/api/admin/operations/tasks/${firstTask.id}`,
      email,
      {
        status: toState,
        expectedUpdatedAt: taskUpdatedAt,
        idempotencyKey,
      },
      "https://admin.atlasez.test",
      "PATCH",
    );
    expect(taskUpdate.status, await taskUpdate.clone().text()).toBe(200);
    taskUpdatedAt = (
      db
        .prepare("SELECT updated_at FROM editorial_tasks WHERE id=?")
        .get(firstTask.id) as { updated_at: string }
    ).updated_at;
  }
  expect(
    db
      .prepare("SELECT status FROM editorial_tasks WHERE id=?")
      .get(firstTask.id),
  ).toEqual({ status: "done" });
  expect(
    db
      .prepare(
        "SELECT from_state,to_state FROM workflow_transition_events WHERE entity_type='task' AND entity_id=? ORDER BY created_at",
      )
      .all(firstTask.id),
  ).toEqual(
    expect.arrayContaining([
      { from_state: "open", to_state: "doing" },
      { from_state: "doing", to_state: "done" },
    ]),
  );

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
  expectApplicationAuditToMinimizeIdentity(
    db,
    applicationId.id,
    email,
    "見送り 検証",
  );
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

function seedInterviewFinalization(db: DatabaseSync, applicantEmail: string) {
  const now = new Date().toISOString();
  const applicationId = "3e9c1220-4574-4bda-b946-643f1a72bf3e";
  const interviewId = "86a2926a-e34e-4c36-8a36-6b1705f6710e";
  const reviewId = "874122bd-ec75-4f83-bc9f-9cbbcdf27bf8";

  db.prepare(
    `INSERT INTO atlasez_member_applications
      (id,name,email,interests,message,status,created_at,updated_at,project_slug,desired_subjects,form_language)
     VALUES (?,?,?,'','隔離テスト','reviewing',?,?,'atlas','mathematics','ja')`,
  ).run(applicationId, "隔離応募者", applicantEmail, now, now);
  db.prepare(
    `INSERT INTO atlasez_application_interviews
      (id,application_id,scheduled_at,timezone,mode,location,status,created_by,created_at,updated_by,updated_at)
     VALUES (?,?,?,'Asia/Tokyo','in_person','隔離会場','scheduled','global@atlasez.test',?,'global@atlasez.test',?)`,
  ).run(interviewId, applicationId, now, now, now);
  db.prepare(
    `INSERT INTO atlasez_application_interview_reviews
      (id,application_id,interview_id,note,assigned_subjects,decision,created_by,created_at,updated_by,updated_at)
     VALUES (?,?,?,'','mathematics','pending','global@atlasez.test',?,'global@atlasez.test',?)`,
  ).run(reviewId, applicationId, interviewId, now, now);
  return { applicationId, interviewId, reviewId, now };
}

it("面談採否・受入副作用・面談記録を一つのD1 batchで確定する", async () => {
  const { db, request, env } = environment();
  const applicantEmail = "interview-finalization@atlasez.test";
  const { applicationId, interviewId, reviewId } = seedInterviewFinalization(
    db,
    applicantEmail,
  );

  const originalBatch = env.REPORTS.batch;
  let writeBatchCount = 0;
  env.REPORTS.batch = async (statements) => {
    writeBatchCount += 1;
    if (writeBatchCount === 2)
      throw new Error("unexpected second D1 write batch");
    return originalBatch(statements);
  };

  const response = await request(
    `/api/admin/applications/${applicationId}/interview/complete?project=atlas`,
    "global@atlasez.test",
    {
      decision: "accepted",
      assignedSubjects: ["mathematics"],
      note: "隔離テスト",
    },
  );

  expect(response.status, await response.clone().text()).toBe(200);
  expect(writeBatchCount).toBe(1);
  expect(
    db
      .prepare("SELECT status FROM atlasez_member_applications WHERE id=?")
      .get(applicationId),
  ).toEqual({ status: "accepted" });
  expect(
    db
      .prepare(
        "SELECT project_id,role FROM atlasez_project_memberships WHERE lower(email)=lower(?)",
      )
      .get(applicantEmail),
  ).toEqual({ project_id: "atlas", role: "member" });
  expect(
    db
      .prepare(
        "SELECT kind,status FROM atlasez_application_email_deliveries WHERE application_id=?",
      )
      .get(applicationId),
  ).toEqual({ kind: "applicant_acceptance", status: "pending" });
  expect(
    db
      .prepare(
        "SELECT status,completed_at FROM atlasez_application_interviews WHERE id=?",
      )
      .get(interviewId),
  ).toMatchObject({ status: "completed" });
  expect(
    db
      .prepare(
        "SELECT decision,finalized_at FROM atlasez_application_interview_reviews WHERE id=?",
      )
      .get(reviewId),
  ).toMatchObject({ decision: "accepted" });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_interview_history WHERE application_id=?",
      )
      .get(applicationId),
  ).toEqual({ count: 1 });
});

it("見送りの面談完了も応募状態・審査記録・履歴を同じD1 batchで確定する", async () => {
  const { db, request, env } = environment();
  const applicantEmail = "interview-rejection@atlasez.test";
  const { applicationId, interviewId, reviewId } = seedInterviewFinalization(
    db,
    applicantEmail,
  );
  db.prepare(
    "DELETE FROM atlasez_application_interview_reviews WHERE id=?",
  ).run(reviewId);

  const originalBatch = env.REPORTS.batch;
  let writeBatchCount = 0;
  env.REPORTS.batch = async (statements) => {
    writeBatchCount += 1;
    if (writeBatchCount === 2)
      throw new Error("unexpected second D1 write batch");
    return originalBatch(statements);
  };

  const response = await request(
    `/api/admin/applications/${applicationId}/interview/complete?project=atlas`,
    "global@atlasez.test",
    {
      decision: "rejected",
      assignedSubjects: ["mathematics"],
      note: "隔離テスト",
    },
  );

  expect(response.status, await response.clone().text()).toBe(200);
  expect(writeBatchCount).toBe(1);
  expect(
    db
      .prepare("SELECT status FROM atlasez_member_applications WHERE id=?")
      .get(applicationId),
  ).toEqual({ status: "rejected" });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_project_memberships WHERE lower(email)=lower(?)",
      )
      .get(applicantEmail),
  ).toEqual({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries WHERE application_id=?",
      )
      .get(applicationId),
  ).toEqual({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT status,completed_at FROM atlasez_application_interviews WHERE id=?",
      )
      .get(interviewId),
  ).toMatchObject({ status: "completed" });
  expect(
    db
      .prepare(
        "SELECT decision,finalized_at FROM atlasez_application_interview_reviews WHERE application_id=?",
      )
      .get(applicationId),
  ).toMatchObject({ decision: "rejected" });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_interview_history WHERE application_id=?",
      )
      .get(applicationId),
  ).toEqual({ count: 1 });
});

it("面談採否の同じD1 batchで途中障害が起きると受入副作用と面談記録をまとめてrollbackする", async () => {
  const { db, request, env } = environment();
  const applicantEmail = "interview-finalization-rollback@atlasez.test";
  const { applicationId, interviewId, reviewId } = seedInterviewFinalization(
    db,
    applicantEmail,
  );

  const originalBatch = env.REPORTS.batch;
  let writeBatchCount = 0;
  env.REPORTS.batch = async (statements) => {
    writeBatchCount += 1;
    if (writeBatchCount === 1)
      return originalBatch([
        ...statements,
        env.REPORTS.prepare(
          "INSERT INTO injected_interview_batch_failure(id) VALUES ('fail')",
        ),
      ]);
    return originalBatch(statements);
  };

  const response = await request(
    `/api/admin/applications/${applicationId}/interview/complete?project=atlas`,
    "global@atlasez.test",
    {
      decision: "accepted",
      assignedSubjects: ["mathematics"],
      note: "隔離テスト",
    },
  );

  expect(response.status).toBe(500);
  expect(writeBatchCount).toBe(1);
  expect(
    db
      .prepare("SELECT status FROM atlasez_member_applications WHERE id=?")
      .get(applicationId),
  ).toEqual({ status: "reviewing" });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_project_memberships WHERE lower(email)=lower(?)",
      )
      .get(applicantEmail),
  ).toEqual({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries WHERE application_id=?",
      )
      .get(applicationId),
  ).toEqual({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT status,completed_at FROM atlasez_application_interviews WHERE id=?",
      )
      .get(interviewId),
  ).toEqual({ status: "scheduled", completed_at: null });
  expect(
    db
      .prepare(
        "SELECT decision,finalized_at FROM atlasez_application_interview_reviews WHERE id=?",
      )
      .get(reviewId),
  ).toEqual({ decision: "pending", finalized_at: null });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_interview_history WHERE application_id=?",
      )
      .get(applicationId),
  ).toEqual({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM workflow_transition_events WHERE entity_id=?",
      )
      .get(applicationId),
  ).toEqual({ count: 0 });
});
