import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import worker from "../../src/admin-worker";

class SqliteD1Statement {
  values: SQLInputValue[] = [];

  constructor(
    readonly query: string,
    private readonly db: DatabaseSync,
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
    const result = this.db.prepare(this.query).run(...this.values);
    return { meta: { changes: Number(result.changes) } };
  }
}

const databases: DatabaseSync[] = [];

const createEnvironment = () => {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec(`
    CREATE TABLE report_admin_permissions (email TEXT NOT NULL, subject TEXT NOT NULL, PRIMARY KEY(email,subject));
    CREATE TABLE editorial_workflow_roles (email TEXT NOT NULL, role TEXT NOT NULL, subject TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL, PRIMARY KEY(email,role,subject));
    CREATE TABLE admin_genre_role_assignments (catalog_id TEXT NOT NULL, email TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(catalog_id,email));
    CREATE TABLE admin_genre_role_catalog (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL);
    CREATE TABLE atlasez_project_memberships (project_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, joined_at TEXT NOT NULL, PRIMARY KEY(project_id,email));
    CREATE TABLE atlasez_member_discord_role_assignments (email TEXT NOT NULL, discord_role_id TEXT NOT NULL, is_active INTEGER NOT NULL, assigned_at TEXT NOT NULL, assigned_by TEXT NOT NULL, PRIMARY KEY(email,discord_role_id));
    CREATE TABLE atlasez_member_discord_accounts (email TEXT PRIMARY KEY, discord_user_id TEXT NOT NULL);
    CREATE TABLE editorial_member_profiles (email TEXT PRIMARY KEY, display_name TEXT, bio TEXT, avatar_url TEXT, university TEXT, year TEXT, interests TEXT, affiliation_type TEXT, country TEXT, timezone TEXT, updated_at TEXT);
    CREATE TABLE admin_member_lifecycle (email TEXT PRIMARY KEY, status TEXT NOT NULL, snapshot_json TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, archived_by TEXT, archived_at TEXT);
    CREATE TABLE atlasez_project_member_lifecycle (project_id TEXT NOT NULL, email TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'active', PRIMARY KEY(project_id,email));
    CREATE TABLE admin_audit_log (id TEXT PRIMARY KEY, actor_email TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, target_label TEXT NOT NULL, summary TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE admin_permission_audit_log (id TEXT PRIMARY KEY, actor_email TEXT NOT NULL, target_email TEXT NOT NULL, action TEXT NOT NULL, before_subjects TEXT NOT NULL, after_subjects TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE editorial_member_profile_change_requests (id TEXT PRIMARY KEY, email TEXT NOT NULL, status TEXT NOT NULL, reviewed_by TEXT, reviewed_at TEXT, submitted_at TEXT NOT NULL);
    CREATE TABLE editorial_documents (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_by TEXT NOT NULL, creator_kind TEXT NOT NULL DEFAULT 'person' CHECK (creator_kind IN ('person','organization')));
    CREATE TABLE atlasez_member_applications (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL);
    INSERT INTO report_admin_permissions VALUES ('ukyoukay0@gmail.com','*'),('member@example.org','mathematics');
    INSERT INTO editorial_workflow_roles VALUES ('member@example.org','subject-coordinator','mathematics','2026-09-01T00:00:00.000Z','manager@example.org');
    INSERT INTO admin_genre_role_assignments VALUES ('catalog-role-1','member@example.org','manager@example.org','2026-09-01T00:00:00.000Z');
    INSERT INTO admin_genre_role_catalog VALUES ('catalog-role-1','atlas','genre','数学');
    INSERT INTO atlasez_project_memberships VALUES ('atlas','member@example.org','member','2026-09-01T00:00:00.000Z');
    INSERT INTO atlasez_member_discord_role_assignments VALUES ('member@example.org','123456789012345678',1,'2026-09-01T00:00:00.000Z','manager@example.org');
    INSERT INTO editorial_member_profiles VALUES ('member@example.org','保存されるプロフィール','本文','https://images.example.org/avatar.png','大学','1年','数学','student','日本','Asia/Tokyo','2026-09-01T00:00:00.000Z');
    INSERT INTO editorial_documents (id,title,created_by) VALUES ('document-1','保存される記事','member@example.org');
    INSERT INTO atlasez_member_applications VALUES ('application-1','member@example.org','保存される応募');
  `);

  const environment = {
    ADMIN_AUTH_MODE: "cloudflare-access",
    ADMIN_PRIMARY_EMAIL: "ukyoukay0@gmail.com",
    REPORTS: {
      prepare: (query: string) => new SqliteD1Statement(query, db),
      batch: async (statements: SqliteD1Statement[]) => {
        db.exec("BEGIN");
        try {
          const results = [];
          for (const statement of statements) {
            if (/^\s*SELECT\b/i.test(statement.query))
              results.push(await statement.all());
            else results.push({ ...(await statement.run()), results: [] });
          }
          db.exec("COMMIT");
          return results;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    },
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
  };
  return { db, environment };
};

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

const request = (
  action: "archive" | "restore",
  email: string,
  actor = "ukyoukay0@gmail.com",
) =>
  new Request("https://admin.example/api/admin/member-management", {
    method: "POST",
    headers: {
      "Cf-Access-Authenticated-User-Email": actor,
      origin: "https://admin.example",
      "content-type": "application/json",
    },
    body: JSON.stringify({ action, email }),
  });

it("archives and restores only operational scopes while retaining member data and audit history", async () => {
  const { db, environment } = createEnvironment();

  const archived = await worker.fetch(
    request("archive", "member@example.org"),
    environment as never,
  );
  expect(archived.status).toBe(200);
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM report_admin_permissions WHERE email='member@example.org'",
      )
      .get(),
  ).toMatchObject({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_workflow_roles WHERE email='member@example.org'",
      )
      .get(),
  ).toMatchObject({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM admin_genre_role_assignments WHERE email='member@example.org'",
      )
      .get(),
  ).toMatchObject({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_project_memberships WHERE email='member@example.org'",
      )
      .get(),
  ).toMatchObject({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT is_active FROM atlasez_member_discord_role_assignments WHERE email='member@example.org'",
      )
      .get(),
  ).toMatchObject({ is_active: 0 });
  expect(
    db
      .prepare(
        "SELECT display_name FROM editorial_member_profiles WHERE email='member@example.org'",
      )
      .get(),
  ).toMatchObject({ display_name: "保存されるプロフィール" });
  expect(
    db
      .prepare("SELECT title FROM editorial_documents WHERE id='document-1'")
      .get(),
  ).toMatchObject({ title: "保存される記事" });
  expect(
    db
      .prepare(
        "SELECT name FROM atlasez_member_applications WHERE id='application-1'",
      )
      .get(),
  ).toMatchObject({ name: "保存される応募" });
  const snapshot = db
    .prepare(
      "SELECT snapshot_json FROM admin_member_lifecycle WHERE email='member@example.org'",
    )
    .get() as { snapshot_json: string };
  expect(JSON.parse(snapshot.snapshot_json)).toMatchObject({
    version: 1,
    permissions: [{ subject: "mathematics" }],
    workflowRoles: [{ role: "subject-coordinator", subject: "mathematics" }],
    genreRoles: [{ catalog_id: "catalog-role-1" }],
    atlasMemberships: [{ role: "member" }],
    discordRoles: [{ discord_role_id: "123456789012345678", is_active: 1 }],
  });

  const restored = await worker.fetch(
    request("restore", "member@example.org"),
    environment as never,
  );
  expect(restored.status).toBe(200);
  expect(
    db
      .prepare(
        "SELECT subject FROM report_admin_permissions WHERE email='member@example.org'",
      )
      .get(),
  ).toMatchObject({ subject: "mathematics" });
  expect(
    db
      .prepare(
        "SELECT role FROM editorial_workflow_roles WHERE email='member@example.org'",
      )
      .get(),
  ).toMatchObject({ role: "subject-coordinator" });
  expect(
    db
      .prepare(
        "SELECT catalog_id FROM admin_genre_role_assignments WHERE email='member@example.org'",
      )
      .get(),
  ).toMatchObject({ catalog_id: "catalog-role-1" });
  expect(
    db
      .prepare(
        "SELECT role FROM atlasez_project_memberships WHERE email='member@example.org'",
      )
      .get(),
  ).toMatchObject({ role: "member" });
  expect(
    db
      .prepare(
        "SELECT is_active FROM atlasez_member_discord_role_assignments WHERE email='member@example.org'",
      )
      .get(),
  ).toMatchObject({ is_active: 1 });
  expect(
    db
      .prepare(
        "SELECT status FROM admin_member_lifecycle WHERE email='member@example.org'",
      )
      .get(),
  ).toMatchObject({ status: "active" });
  expect(
    db
      .prepare("SELECT action FROM admin_audit_log ORDER BY created_at,id")
      .all(),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ action: "member_archived" }),
      expect.objectContaining({ action: "member_restored" }),
    ]),
  );
});

it("requires a global administrator and prevents archiving the acting account", async () => {
  const { db, environment } = createEnvironment();
  const denied = await worker.fetch(
    request("archive", "member@example.org", "member@example.org"),
    environment as never,
  );
  expect(denied.status).toBe(403);
  const selfArchive = await worker.fetch(
    request("archive", "ukyoukay0@gmail.com"),
    environment as never,
  );
  expect(selfArchive.status).toBe(400);
  expect(
    db.prepare("SELECT COUNT(*) AS count FROM admin_member_lifecycle").get(),
  ).toMatchObject({ count: 0 });
});

it("rejects malformed restore snapshots without changing archived state", async () => {
  const { db, environment } = createEnvironment();
  const archived = await worker.fetch(
    request("archive", "member@example.org"),
    environment as never,
  );
  expect(archived.status).toBe(200);
  db.prepare(
    `UPDATE admin_member_lifecycle SET snapshot_json=? WHERE email='member@example.org'`,
  ).run(
    JSON.stringify({
      version: 1,
      permissions: [{ subject: "mathematics" }],
      workflowRoles: [null],
      genreRoles: [],
      atlasMemberships: [],
      discordRoles: [],
    }),
  );

  const restored = await worker.fetch(
    request("restore", "member@example.org"),
    environment as never,
  );
  expect(restored.status).toBe(409);
  expect(await restored.json()).toMatchObject({
    error: expect.stringContaining("状態は変更していません"),
  });
  expect(
    db
      .prepare(
        "SELECT status FROM admin_member_lifecycle WHERE email='member@example.org'",
      )
      .get(),
  ).toMatchObject({ status: "archived" });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM report_admin_permissions WHERE email='member@example.org'",
      )
      .get(),
  ).toMatchObject({ count: 0 });
});

it("does not let assignment APIs re-enable a member while archived", async () => {
  const { db, environment } = createEnvironment();
  db.prepare(
    `INSERT INTO admin_member_lifecycle
       (email,status,snapshot_json,created_by,created_at,updated_by,updated_at,archived_by,archived_at)
     VALUES ('member@example.org','archived','{}','','2026-09-01T00:00:00.000Z','','2026-09-01T00:00:00.000Z','manager@example.org','2026-09-01T00:00:00.000Z')`,
  ).run();
  const response = await worker.fetch(
    new Request("https://admin.example/api/admin/report-admin-permissions", {
      method: "POST",
      headers: {
        "Cf-Access-Authenticated-User-Email": "ukyoukay0@gmail.com",
        origin: "https://admin.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "member@example.org", subject: "physics" }),
    }),
    environment as never,
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "MEMBER_ARCHIVED" });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM report_admin_permissions WHERE email='member@example.org' AND subject='physics'",
      )
      .get(),
  ).toMatchObject({ count: 0 });
});

it("returns a global-admin member detail with recorded history and honest creator state", async () => {
  const { db, environment } = createEnvironment();
  db.prepare(
    `INSERT INTO admin_audit_log
       (id,actor_email,action,target_type,target_id,target_label,summary,details_json,created_at)
     VALUES ('audit-1','manager@example.org','member_archived','member','member@example.org','member@example.org','アーカイブ','{}','2026-09-28T00:00:00.000Z')`,
  ).run();
  db.prepare(
    `INSERT INTO admin_permission_audit_log
       (id,actor_email,target_email,action,before_subjects,after_subjects,created_at)
     VALUES ('permission-audit-1','manager@example.org','member@example.org','grant','','mathematics','2026-09-27T00:00:00.000Z')`,
  ).run();
  const response = await worker.fetch(
    new Request(
      "https://admin.example/api/admin/member-management?email=member%40example.org",
      {
        headers: {
          "Cf-Access-Authenticated-User-Email": "ukyoukay0@gmail.com",
        },
      },
    ),
    environment as never,
  );
  expect(response.status).toBe(200);
  const data = (await response.json()) as {
    member: {
      createdBy: string | null;
      articleCount: number;
      applicationCount: number;
      profile: { displayName: string; bio: string };
      history: Array<{ action: string }>;
    };
  };
  expect(data.member).toMatchObject({
    createdBy: null,
    articleCount: 1,
    applicationCount: 1,
    profile: { displayName: "保存されるプロフィール", bio: "本文" },
  });
  expect(data.member.history.map((entry) => entry.action)).toEqual([
    "member_archived",
    "grant",
  ]);
});

it("does not expose member details to a non-global operator", async () => {
  const { environment } = createEnvironment();
  const response = await worker.fetch(
    new Request(
      "https://admin.example/api/admin/member-management?email=member%40example.org",
      {
        headers: { "Cf-Access-Authenticated-User-Email": "member@example.org" },
      },
    ),
    environment as never,
  );
  expect(response.status).toBe(403);
});

it("records workflow-role history only when a role assignment actually changes", async () => {
  const { db, environment } = createEnvironment();
  const addRole = () =>
    worker.fetch(
      new Request("https://admin.example/api/admin/editorial-workflow-roles", {
        method: "POST",
        headers: {
          "Cf-Access-Authenticated-User-Email": "ukyoukay0@gmail.com",
          origin: "https://admin.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "member@example.org",
          role: "subject-coordinator",
          subjects: ["mathematics", "physics"],
        }),
      }),
      environment as never,
    );

  const first = await addRole();
  expect(first.status).toBe(201);
  expect(await first.json()).toMatchObject({ added: 1 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM admin_audit_log WHERE target_type='member'",
      )
      .get(),
  ).toMatchObject({ count: 1 });

  const duplicate = await addRole();
  expect(duplicate.status).toBe(201);
  expect(await duplicate.json()).toMatchObject({ added: 0 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM admin_audit_log WHERE target_type='member'",
      )
      .get(),
  ).toMatchObject({ count: 1 });
});
