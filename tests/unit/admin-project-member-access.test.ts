import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import worker from "../../src/admin-worker";

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
      throw new Error("隔離検証の外部通信は禁止");
    }),
  ),
);
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fixture() {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  const migrations = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(new URL(file, migrations), "utf8"));
  db.exec("PRAGMA foreign_keys=ON");
  const env = {
    ADMIN_AUTH_MODE: "google-oauth",
    ADMIN_PRIMARY_EMAIL: "global@atlasez.test",
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
        new Response("isolated project page", {
          headers: { "content-type": "text/html" },
        }),
    },
  };
  const now = new Date().toISOString();
  // Production has this canonical record; migration0051 removes only an empty legacy duplicate.
  db.prepare(
    "INSERT OR IGNORE INTO atlasez_projects(id,slug,name,description,created_at) VALUES ('seminar-platform','seminar-platform','ゼミプラットフォーム','',?)",
  ).run(now);
  const member = (
    email: string,
    project = "thinking-cafe",
    role = "member",
    profile = true,
  ) => {
    db.prepare(
      "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES (?,?,?,?)",
    ).run(project, email, role, now);
    if (profile) {
      db.prepare(
        "INSERT OR IGNORE INTO editorial_member_profiles(email,display_name,bio,updated_at) VALUES (?,?,?,?)",
      ).run(email, email.split("@")[0], "共通自己紹介", now);
      db.prepare(
        "INSERT INTO editorial_project_member_profiles(project_id,email,internal_bio,updated_at) VALUES (?,?,?,?)",
      ).run(project, email, "承認済みの自己紹介", now);
    }
  };
  const application = (id: string, project = "thinking-cafe") => {
    db.prepare(
      "INSERT INTO atlasez_member_applications(id,name,email,interests,message,status,created_at,updated_at,project_slug,desired_subjects) VALUES (?,?,?,?,?,'new',?,?,?,'mathematics')",
    ).run(
      id,
      "検証応募者",
      `${id}@atlasez.test`,
      "討論",
      "参加希望",
      now,
      now,
      project,
    );
  };
  const request = (
    path: string,
    email: string,
    method = "GET",
    body?: unknown,
    origin = "https://admin.atlasez.test",
  ) => {
    const token = `isolated-project-${email}`;
    db.prepare(
      "INSERT OR REPLACE INTO admin_auth_sessions(session_hash,email,expires_at,created_at) VALUES (?,?,?,?)",
    ).run(
      createHash("sha256").update(token).digest("hex"),
      email,
      "2099-01-01T00:00:00.000Z",
      now,
    );
    return worker.fetch(
      new Request(`https://admin.atlasez.test${path}`, {
        method,
        headers: {
          cookie: `atlasez_admin_session=${token}`,
          origin,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env as never,
    );
  };
  return { db, member, application, request, now };
}

it("プロジェクト責任者はAtlas権限なしで担当応募を審査・受入でき他プロジェクトは操作できない", async () => {
  const { db, member, application, request } = fixture();
  const manager = "cafe-manager@atlasez.test";
  member(manager, "thinking-cafe", "manager", false);
  const id = "11111111-1111-4111-8111-111111111111";
  application(id);
  application("22222222-2222-4222-8222-222222222222", "atlas");
  const list = await request(
    "/api/admin/applications?project=thinking-cafe",
    manager,
  );
  expect(list.status, await list.clone().text()).toBe(200);
  expect(
    (
      (await list.json()) as { applications: Array<{ id: string }> }
    ).applications.map((row) => row.id),
  ).toEqual([id]);
  expect(
    (await request("/admin/applications/?project=thinking-cafe", manager))
      .status,
  ).toBe(200);
  expect(
    (await request("/admin/manage/?project=thinking-cafe", manager)).status,
  ).toBe(200);
  expect((await request("/admin/thinking-cafe/", manager)).status).toBe(200);
  for (const path of [
    "/api/admin/applications?project=atlas",
    "/admin/applications/?project=atlas",
    "/api/admin/report-admin-permissions",
    "/api/admin/editor/documents",
    "/admin/editor/",
  ])
    expect([302, 403]).toContain((await request(path, manager)).status);
  expect(
    await (await request("/api/admin/auth-status", manager)).json(),
  ).toMatchObject({
    isManager: false,
    canAccessAdmin: false,
    canAccessScopedAdminPages: false,
    managerProjects: ["thinking-cafe"],
  });
  for (const [path, method] of [
    ["/api/admin/applications?project=thinking-cafe", "POST"],
    [`/api/admin/applications/${id}?project=thinking-cafe`, "PUT"],
    [
      `/api/admin/applications/${id}/interview-extra?project=thinking-cafe`,
      "GET",
    ],
    ["/api/admin/project-introductions?project=thinking-cafe", "PUT"],
    ["/api/admin/project-profile-extra?project=thinking-cafe", "GET"],
  ])
    expect(
      (await request(path, manager, method, method === "GET" ? undefined : {}))
        .status,
    ).toBe(403);
  const accepted = await request(
    `/api/admin/applications/${id}?project=thinking-cafe`,
    manager,
    "PATCH",
    { status: "accepted" },
  );
  expect(accepted.status, await accepted.clone().text()).toBe(200);
  expect(
    db
      .prepare(
        "SELECT project_id,role FROM atlasez_project_memberships WHERE email=?",
      )
      .all(`${id}@atlasez.test`),
  ).toEqual([{ project_id: "thinking-cafe", role: "member" }]);
  expect(
    db
      .prepare(
        "SELECT project_id FROM atlasez_project_memberships WHERE email=?",
      )
      .all(manager),
  ).toEqual([{ project_id: "thinking-cafe" }]);
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM report_admin_permissions WHERE email IN (?,?)",
      )
      .get(manager, `${id}@atlasez.test`),
  ).toEqual({ count: 0 });
  db.prepare(
    "UPDATE atlasez_project_memberships SET role='member' WHERE email=?",
  ).run(manager);
  expect(
    (await request("/api/admin/applications?project=thinking-cafe", manager))
      .status,
  ).toBe(403);
});

it("受入済み応募の操作キー再送でもAtlas休止を迂回できない", async () => {
  const { db, application, request, now } = fixture();
  const id = "cccccccc-1111-4111-8111-111111111111";
  application(id, "atlas");
  db.prepare(
    "UPDATE atlasez_member_applications SET status='reviewing' WHERE id=?",
  ).run(id);
  const payload = {
    status: "accepted",
    expectedStatus: "reviewing",
    idempotencyKey: "accepted-before-pause",
  };
  const accepted = await request(
    `/api/admin/applications/${id}?project=atlas`,
    "global@atlasez.test",
    "PATCH",
    payload,
  );
  expect(accepted.status, await accepted.clone().text()).toBe(200);
  db.prepare(
    "INSERT INTO atlasez_project_member_lifecycle(project_id,email,state,role_snapshot,last_request_id,updated_at) VALUES ('atlas',?,'paused','member','isolated',?)",
  ).run(`${id}@atlasez.test`, now);
  const replay = await request(
    `/api/admin/applications/${id}?project=atlas`,
    "global@atlasez.test",
    "PATCH",
    payload,
  );
  expect(replay.status, await replay.clone().text()).toBe(409);
  const workflowReplay = await request(
    "/api/admin/workflow/transition",
    "global@atlasez.test",
    "POST",
    {
      entityType: "application",
      entityId: id,
      fromState: "reviewing",
      toState: "accepted",
      idempotencyKey: payload.idempotencyKey,
    },
  );
  expect(workflowReplay.status, await workflowReplay.clone().text()).toBe(409);
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM workflow_transition_events WHERE entity_id=?",
      )
      .get(id),
  ).toEqual({ count: 1 });
});

it("本人の自己紹介申請と担当責任者の承認はプロジェクト境界と送信元を守る", async () => {
  const { db, member, request } = fixture();
  const email = "cafe-member@atlasez.test",
    manager = "cafe-manager@atlasez.test";
  member(email);
  member(manager, "thinking-cafe", "manager");
  member("outside@atlasez.test", "secretariat", "manager");
  expect(
    (await request("/admin/workspace/?project=thinking-cafe", email)).status,
  ).toBe(200);
  expect((await request("/admin/workspace/?project=atlas", email)).status).toBe(
    403,
  );
  const mine = await request(
    "/api/admin/project-profile?project=thinking-cafe",
    email,
  );
  expect(mine.status).toBe(200);
  expect(await mine.json()).toMatchObject({
    email,
    canEditArticles: false,
    canReview: false,
    project: { id: "thinking-cafe", role: "member" },
  });
  const payload = {
    projectId: "thinking-cafe",
    internalBio: "新しい本人自己紹介",
    email: manager,
  };
  expect(
    (
      await request(
        "/api/admin/project-profile",
        email,
        "PUT",
        payload,
        "https://outside.example",
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request("/api/admin/project-profile", email, "PUT", {
        ...payload,
        projectId: "atlas",
      })
    ).status,
  ).toBe(403);
  const saved = await request(
    "/api/admin/project-profile",
    email,
    "PUT",
    payload,
  );
  expect(saved.status, await saved.clone().text()).toBe(200);
  const { requestId } = (await saved.json()) as { requestId: string };
  expect(
    db
      .prepare(
        "SELECT email,project_id,status FROM editorial_project_profile_change_requests WHERE id=?",
      )
      .get(requestId),
  ).toEqual({ email, project_id: "thinking-cafe", status: "pending" });
  expect(
    (
      await request(
        "/api/admin/project-profile-change-requests?project=thinking-cafe",
        email,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        "/admin/project-profile-requests/?project=thinking-cafe",
        manager,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await request(
        `/api/admin/project-profile-change-requests/${requestId}`,
        "outside@atlasez.test",
        "PATCH",
        { action: "approve" },
      )
    ).status,
  ).toBe(403);
  const review = await request(
    `/api/admin/project-profile-change-requests/${requestId}`,
    manager,
    "PATCH",
    { action: "approve", idempotencyKey: "project-profile-approval" },
  );
  expect(review.status, await review.clone().text()).toBe(200);
  expect(
    db
      .prepare(
        "SELECT internal_bio FROM editorial_project_member_profiles WHERE email=? AND project_id='thinking-cafe'",
      )
      .get(email),
  ).toEqual({ internal_bio: "新しい本人自己紹介" });
  expect(
    (
      await request(
        `/api/admin/project-profile-change-requests/${requestId}`,
        manager,
        "PATCH",
        { action: "approve", idempotencyKey: "project-profile-approval" },
      )
    ).status,
  ).toBe(200);
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM workflow_transition_events WHERE entity_id=?",
      )
      .get(requestId),
  ).toEqual({ count: 1 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries",
      )
      .get(),
  ).toEqual({ count: 0 });
});

it("紹介一覧は所属先だけを表示し通常メンバーにメールや応募個人情報を返さない", async () => {
  const { db, member, request } = fixture();
  member("member@atlasez.test");
  member("peer@atlasez.test");
  member("secret@atlasez.test", "secretariat");
  const response = await request(
    "/api/admin/project-introductions?project=thinking-cafe",
    "member@atlasez.test",
  );
  expect(response.status).toBe(200);
  const data = (await response.json()) as {
    entries: Array<Record<string, unknown>>;
  };
  expect(data.entries).toHaveLength(2);
  expect(
    data.entries.every(
      (entry) => !("email" in entry) && !("birth_date" in entry),
    ),
  ).toBe(true);
  expect(JSON.stringify(data)).not.toContain("secret@atlasez.test");
  const firstPage = (await (
    await request(
      "/api/admin/project-introductions?project=thinking-cafe&limit=1",
      "member@atlasez.test",
    )
  ).json()) as {
    entries: Array<Record<string, unknown>>;
    pagination: { nextCursor: string };
  };
  expect(firstPage.pagination.nextCursor).toMatch(/\|\d+$/);
  expect(decodeURIComponent(firstPage.pagination.nextCursor)).not.toContain(
    "@",
  );
  const secondPage = (await (
    await request(
      `/api/admin/project-introductions?project=thinking-cafe&limit=1&cursor=${encodeURIComponent(firstPage.pagination.nextCursor)}`,
      "member@atlasez.test",
    )
  ).json()) as { entries: Array<Record<string, unknown>> };
  expect(secondPage.entries).toHaveLength(1);
  expect(secondPage.entries[0].display_name).not.toBe(
    firstPage.entries[0].display_name,
  );
  expect(
    (
      await request(
        "/admin/introductions/?project=thinking-cafe",
        "member@atlasez.test",
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await request(
        "/api/admin/project-introductions?project=secretariat",
        "member@atlasez.test",
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        "/api/admin/project-profile",
        "member@atlasez.test",
        "POST",
        {},
      )
    ).status,
  ).toBe(403);
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("プロジェクトトップはURLの所属を検証し通常メンバーのタスク・カレンダーを所属先だけに絞る", async () => {
  const { db, member, request, now } = fixture();
  const email = "member@atlasez.test";
  const homes = [
    ["atlas", "/admin/atlas/"],
    ["secretariat", "/admin/secretariat/"],
    ["seminar-platform", "/admin/semi-platform/"],
    ["student-council-exchange", "/admin/student-council/"],
    ["thinking-cafe", "/admin/thinking-cafe/"],
  ];
  member(email);
  for (const [project, path] of homes) {
    expect((await request(`${path}?project=thinking-cafe`, email)).status).toBe(
      project === "thinking-cafe" ? 200 : 403,
    );
    if (project !== "thinking-cafe") member(email, project);
    expect((await request(path, email)).status).toBe(200);
  }
  for (const project of ["atlas", "thinking-cafe"])
    db.prepare(
      "INSERT INTO editorial_events(id,project_id,subject,title,details,starts_at,ends_at,created_by,created_at) VALUES (?,?, '',?,'','2026-10-06T04:00:00Z','2026-10-06T05:00:00Z',?,?)",
    ).run(crypto.randomUUID(), project, `${project}予定`, email, now);
  const calendar = await request(
    "/api/admin/member-calendar?project=thinking-cafe",
    email,
  );
  expect(calendar.status, await calendar.clone().text()).toBe(200);
  expect(await calendar.json()).toMatchObject({
    events: [{ title: "thinking-cafe予定" }],
  });
  expect(
    (await request("/admin/member-tasks/?project=thinking-cafe", email)).status,
  ).toBe(200);
  expect(
    (await request("/admin/member-calendar/?project=thinking-cafe", email))
      .status,
  ).toBe(200);
  db.prepare(
    "DELETE FROM atlasez_project_memberships WHERE project_id='thinking-cafe' AND email=?",
  ).run(email);
  expect(
    (await request("/admin/thinking-cafe/?project=atlas", email)).status,
  ).toBe(403);
  expect(
    (await request("/api/admin/member-calendar?project=thinking-cafe", email))
      .status,
  ).toBe(403);
  expect(
    (await request("/api/admin/project-profile?project=thinking-cafe", email))
      .status,
  ).toBe(403);
});

it("Atlasのアーカイブ・休止・退会は応募の再受入と再送を止め他プロジェクトの受入は妨げない", async () => {
  const { db, application, request, now } = fixture();
  const manager = "global@atlasez.test";
  for (const [index, state] of ["archived", "paused", "withdrawn"].entries()) {
    const id = `0000000${index}-1111-4111-8111-111111111111`;
    application(id, "atlas");
    const targetEmail = `${id}@atlasez.test`;
    if (state === "archived")
      db.prepare(
        "INSERT INTO admin_member_lifecycle(email,status,created_at,updated_at) VALUES (?,'archived',?,?)",
      ).run(targetEmail, now, now);
    else
      db.prepare(
        "INSERT INTO atlasez_project_member_lifecycle(project_id,email,state,role_snapshot,last_request_id,updated_at) VALUES ('atlas',?,?,'member','isolated',?)",
      ).run(targetEmail, state, now);
    const accepted = await request(
      `/api/admin/applications/${id}?project=atlas`,
      manager,
      "PATCH",
      { status: "accepted", idempotencyKey: `inactive-${index}` },
    );
    expect(accepted.status, await accepted.clone().text()).toBe(409);
    expect(await accepted.json()).toMatchObject({ code: "MEMBER_INACTIVE" });
    db.prepare(
      "UPDATE atlasez_member_applications SET status='reviewing' WHERE id=?",
    ).run(id);
    const workflow = await request(
      "/api/admin/workflow/transition",
      manager,
      "POST",
      {
        entityType: "application",
        entityId: id,
        fromState: "reviewing",
        toState: "accepted",
        idempotencyKey: `workflow-inactive-${index}`,
      },
    );
    expect(workflow.status, await workflow.clone().text()).toBe(409);
    db.prepare(
      "UPDATE atlasez_member_applications SET status='accepted' WHERE id=?",
    ).run(id);
    expect(
      (
        await request(
          `/api/admin/applications/${id}/discord-retry?project=atlas`,
          manager,
          "POST",
          {},
        )
      ).status,
    ).toBe(409);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM report_admin_permissions WHERE email=?",
        )
        .get(targetEmail),
    ).toEqual({ count: 0 });
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM atlasez_project_memberships WHERE email=?",
        )
        .get(targetEmail),
    ).toEqual({ count: 0 });
    const cafeId = `1000000${index}-1111-4111-8111-111111111111`;
    application(cafeId);
    db.prepare("UPDATE atlasez_member_applications SET email=? WHERE id=?").run(
      targetEmail,
      cafeId,
    );
    const other = await request(
      `/api/admin/applications/${cafeId}?project=thinking-cafe`,
      manager,
      "PATCH",
      { status: "accepted" },
    );
    expect(other.status, await other.clone().text()).toBe(200);
    expect(
      db
        .prepare(
          "SELECT project_id FROM atlasez_project_memberships WHERE email=?",
        )
        .all(targetEmail),
    ).toEqual([{ project_id: "thinking-cafe" }]);
  }
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("事務局責任者はAtlas所属を作らず本人情報・Atlas自己紹介を審査できる", async () => {
  const { db, member, request } = fixture();
  const reviewer = "secretariat-manager@atlasez.test",
    atlasMember = "atlas-member@atlasez.test";
  member(reviewer, "secretariat", "manager");
  member(atlasMember, "atlas");
  expect((await request("/admin/profile-requests/", reviewer)).status).toBe(
    200,
  );
  expect(
    (await request("/api/admin/profile-change-requests", reviewer)).status,
  ).toBe(200);
  const submitted = await request(
    "/api/admin/project-profile",
    atlasMember,
    "PUT",
    { projectId: "atlas", internalBio: "事務局で確認する自己紹介" },
  );
  expect(submitted.status).toBe(200);
  const { requestId } = (await submitted.json()) as { requestId: string };
  const listed = await request(
    "/api/admin/project-profile-change-requests?project=atlas",
    reviewer,
  );
  expect(listed.status, await listed.clone().text()).toBe(200);
  expect(
    (
      await request(
        `/api/admin/project-profile-change-requests/${requestId}`,
        reviewer,
        "PATCH",
        { action: "approve" },
      )
    ).status,
  ).toBe(200);
  expect((await request("/api/admin/editor/documents", reviewer)).status).toBe(
    403,
  );
  expect(
    db
      .prepare(
        "SELECT project_id FROM atlasez_project_memberships WHERE email=?",
      )
      .all(reviewer),
  ).toEqual([{ project_id: "secretariat" }]);
});

it("Atlasだけの責任者にも対象自己紹介の承認導線とAPIを許可する", async () => {
  const { member, request } = fixture();
  const manager = "atlas-manager@atlasez.test";
  member(manager, "atlas", "manager");
  expect(
    await (
      await request("/api/admin/project-profile?project=atlas", manager)
    ).json(),
  ).toMatchObject({ canReview: true, canEditArticles: false });
  expect(
    (await request("/admin/project-profile-requests/?project=atlas", manager))
      .status,
  ).toBe(200);
  expect(
    (
      await request(
        "/api/admin/project-profile-change-requests?project=atlas",
        manager,
      )
    ).status,
  ).toBe(200);
  expect(
    (await request("/api/admin/profile-change-requests", manager)).status,
  ).toBe(403);
});
