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
      throw new Error("隔離受入検証から外部通信は禁止");
    }),
  ),
);
afterEach(() => vi.unstubAllGlobals());
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
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
      batch: (() => {
        let tail = Promise.resolve();
        return async (statements: Statement[]) => {
          const previous = tail;
          let release!: () => void;
          tail = new Promise<void>((resolve) => {
            release = resolve;
          });
          await previous;
          db.exec("BEGIN");
          try {
            const results = [];
            for (const statement of statements)
              results.push(await statement.run());
            db.exec("COMMIT");
            return results;
          } catch (error) {
            db.exec("ROLLBACK");
            throw error;
          } finally {
            release();
          }
        };
      })(),
    },
    ASSETS: {
      fetch: async () =>
        new Response("isolated", { headers: { "content-type": "text/html" } }),
    },
  };
  const now = new Date().toISOString();
  const manager = "manager@atlasez.test";
  db.prepare(
    "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('thinking-cafe',?,'manager',?)",
  ).run(manager, now);
  db.prepare(
    "INSERT INTO editorial_member_profiles(email,display_name,bio,updated_at) VALUES (?,?,?,?)",
  ).run(manager, "運営", "", now);
  const member = (email: string) =>
    db
      .prepare(
        "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('thinking-cafe',?,'member',?)",
      )
      .run(email, now);
  const application = (id: string, email: string) =>
    db
      .prepare(
        "INSERT INTO atlasez_member_applications(id,name,email,interests,message,status,created_at,updated_at,project_slug,desired_subjects) VALUES (?,? ,?,'',?,'accepted',?,?, 'thinking-cafe','')",
      )
      .run(id, "受入候補", email, "希望", now, now);
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    email = manager,
  ) => {
    const token = `intake-fixture-session-${email}`;
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
          origin: "https://admin.atlasez.test",
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env as never,
    );
  };
  return { db, member, application, request, now };
}

it("応募後フォローをproject/emailで保存し、初回タスクから通知を作らず応募削除後も保持する", async () => {
  const { db, member, application, request, now } = fixture();
  const email = "new-member@atlasez.test";
  const applicationId = "11111111-1111-4111-8111-111111111111";
  member(email);
  application(applicationId, email);

  const listed = await request(
    "/api/admin/member-intake?project=thinking-cafe",
  );
  expect(listed.status, await listed.clone().text()).toBe(200);
  expect(
    (
      (await listed.json()) as {
        entries: Array<{ email: string; application_id: string }>;
      }
    ).entries,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ email, application_id: applicationId }),
    ]),
  );

  const saved = await request(
    "/api/admin/member-intake?project=thinking-cafe",
    "PUT",
    {
      email,
      applicationId,
      expectedRevision: 0,
      responsibleEmail: "manager@atlasez.test",
      consultationEmail: "manager@atlasez.test",
      contactStatus: "contacted",
      contactNote: "歓迎案内を送る予定",
      firstTaskTitle: "最初の記事を一つ読む",
      followUpAt: "2026-10-08T03:00:00.000Z",
      followUpCompleted: false,
    },
  );
  expect(saved.status, await saved.clone().text()).toBe(200);
  const tracking = db
    .prepare(
      "SELECT project_id,email,application_id,contact_status,contact_note,first_task_id,follow_up_at FROM editorial_member_intake_tracking WHERE project_id='thinking-cafe'",
    )
    .get() as Record<string, unknown>;
  expect(tracking).toMatchObject({
    project_id: "thinking-cafe",
    email,
    application_id: applicationId,
    contact_status: "contacted",
    contact_note: "歓迎案内を送る予定",
    follow_up_at: "2026-10-08T03:00:00.000Z",
  });
  const taskId = String(tracking.first_task_id);
  const task = db
    .prepare(
      "SELECT is_test_data,reminder_at,reminder_email,assignee_email FROM editorial_tasks WHERE id=?",
    )
    .get(taskId) as Record<string, unknown>;
  expect(task).toEqual({
    is_test_data: 0,
    reminder_at: null,
    reminder_email: null,
    assignee_email: email,
  });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_task_reminders WHERE task_id=?",
      )
      .get(taskId),
  ).toEqual({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM admin_audit_log WHERE action='member_intake_updated'",
      )
      .get(),
  ).toEqual({ count: 1 });
  expect(
    db
      .prepare(
        "SELECT consultation_email,first_task_type FROM editorial_member_intake_tracking WHERE project_id='thinking-cafe'",
      )
      .get(),
  ).toEqual({
    consultation_email: "manager@atlasez.test",
    first_task_type: "member",
  });

  db.prepare("DELETE FROM atlasez_member_applications WHERE id=?").run(
    applicationId,
  );
  const afterRetention = await request(
    "/api/admin/member-intake?project=thinking-cafe",
  );
  expect(afterRetention.status).toBe(200);
  expect(
    (
      (await afterRetention.json()) as {
        entries: Array<{ email: string; application_id: string }>;
      }
    ).entries,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ email, application_id: applicationId }),
    ]),
  );
  const stale = await request(
    "/api/admin/member-intake?project=thinking-cafe",
    "PUT",
    {
      email,
      applicationId,
      expectedRevision: 0,
      responsibleEmail: "manager@atlasez.test",
      consultationEmail: "",
      contactStatus: "replied",
      contactNote: "stale overwrite",
      firstTaskTitle: "",
      followUpAt: null,
      followUpCompleted: false,
    },
  );
  expect(stale.status).toBe(409);
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM admin_audit_log WHERE action='member_intake_updated'",
      )
      .get(),
  ).toEqual({ count: 1 });

  db.prepare(
    `INSERT INTO editorial_member_intake_tracking
    (project_id,email,application_id,responsible_email,consultation_email,contact_status,contact_note,created_by,created_at,updated_by,updated_at)
    VALUES ('thinking-cafe','manager@atlasez.test',NULL,'manager@atlasez.test','manager@atlasez.test','contacted','private staff note','manager@atlasez.test',?,'manager@atlasez.test',?)`,
  ).run(now, now);
  const own = await request("/api/admin/my-intake");
  expect(own.status, await own.clone().text()).toBe(200);
  const ownEntries = (
    (await own.json()) as { entries: Array<Record<string, unknown>> }
  ).entries;
  expect(ownEntries).toHaveLength(1);
  expect(ownEntries[0]).toMatchObject({
    project_id: "thinking-cafe",
    project_name: "考えるカフェ",
    consultation_email: "manager@atlasez.test",
  });
  expect(ownEntries[0]).not.toHaveProperty("email");
  expect(ownEntries[0]).not.toHaveProperty("contact_note");
  expect(ownEntries[0]).not.toHaveProperty("application_id");
});

it("応募情報がない直接追加メンバーも受入フォローに記録でき、他プロジェクト対象を拒否する", async () => {
  const { db, member, request } = fixture();
  const email = "direct-member@atlasez.test";
  member(email);
  const invalid = await request(
    "/api/admin/member-intake?project=thinking-cafe",
    "PUT",
    null,
  );
  expect(invalid.status).toBe(400);
  const saved = await request(
    "/api/admin/member-intake?project=thinking-cafe",
    "PUT",
    {
      email,
      expectedRevision: 0,
      responsibleEmail: "manager@atlasez.test",
      consultationEmail: "manager@atlasez.test",
      contactStatus: "not_contacted",
      contactNote: "",
      firstTaskTitle: "",
      followUpAt: null,
      followUpCompleted: false,
    },
  );
  expect(saved.status, await saved.clone().text()).toBe(200);
  expect(
    db
      .prepare(
        "SELECT project_id,email,application_id FROM editorial_member_intake_tracking",
      )
      .get(),
  ).toEqual({ project_id: "thinking-cafe", email, application_id: null });
  const denied = await request(
    "/api/admin/member-intake?project=atlas",
    "PUT",
    {
      email,
      responsibleEmail: "manager@atlasez.test",
      contactStatus: "contacted",
      contactNote: "",
      firstTaskTitle: "",
      followUpAt: null,
      followUpCompleted: false,
    },
  );
  expect([403, 404]).toContain(denied.status);
});

it("応募中は初回タスクを担当運営者へ割り当て、同じ初期revisionの保存競合を拒否する", async () => {
  const { db, application, request } = fixture();
  const email = "applicant@atlasez.test";
  application("77777777-7777-4777-8777-777777777777", email);
  const body = {
    email,
    applicationId: "77777777-7777-4777-8777-777777777777",
    expectedRevision: 0,
    responsibleEmail: "manager@atlasez.test",
    consultationEmail: "manager@atlasez.test",
    contactStatus: "not_contacted",
    contactNote: "",
    firstTaskTitle: "参加準備を確認する",
    followUpAt: null,
    followUpCompleted: false,
  };
  const responses = await Promise.all([
    request("/api/admin/member-intake?project=thinking-cafe", "PUT", body),
    request("/api/admin/member-intake?project=thinking-cafe", "PUT", body),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  expect(
    db
      .prepare(
        "SELECT assignee_email,details FROM editorial_tasks WHERE title='参加準備を確認する'",
      )
      .get(),
  ).toEqual({
    assignee_email: "manager@atlasez.test",
    details:
      "受入準備タスク：applicant@atlasez.test\n参加前の案内・準備に関する運営タスクです。",
  });
  expect(
    db
      .prepare(
        "SELECT first_task_type,revision FROM editorial_member_intake_tracking WHERE email=?",
      )
      .get(email),
  ).toEqual({ first_task_type: "operator", revision: 1 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM admin_audit_log WHERE action='member_intake_updated'",
      )
      .get(),
  ).toEqual({ count: 1 });
});

it("更新競合で敗れた保存はタスク・監査を作らず勝者の内容を保持する", async () => {
  const { db, member, request } = fixture();
  const email = "concurrent-member@atlasez.test";
  member(email);
  const base = {
    email,
    expectedRevision: 0,
    responsibleEmail: "manager@atlasez.test",
    consultationEmail: "manager@atlasez.test",
    contactStatus: "not_contacted",
    contactNote: "initial",
    firstTaskTitle: "",
    followUpAt: null,
    followUpCompleted: false,
  };
  expect(
    (
      await request(
        "/api/admin/member-intake?project=thinking-cafe",
        "PUT",
        base,
      )
    ).status,
  ).toBe(200);
  const payloads = ["winner-a", "winner-b"].map((name) => ({
    ...base,
    expectedRevision: 1,
    contactNote: name,
    firstTaskTitle: name,
  }));
  const responses = await Promise.all(
    payloads.map((body) =>
      request("/api/admin/member-intake?project=thinking-cafe", "PUT", body),
    ),
  );
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  const winner =
    payloads[responses.findIndex((response) => response.status === 200)];
  expect(
    db
      .prepare(
        "SELECT contact_note,first_task_title,revision FROM editorial_member_intake_tracking WHERE email=?",
      )
      .get(email),
  ).toEqual({
    contact_note: winner.contactNote,
    first_task_title: winner.firstTaskTitle,
    revision: 2,
  });
  expect(
    db.prepare("SELECT COUNT(*) AS count FROM editorial_tasks").get(),
  ).toEqual({ count: 1 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM admin_audit_log WHERE action='member_intake_updated'",
      )
      .get(),
  ).toEqual({ count: 2 });
  expect(fetch).not.toHaveBeenCalled();
});

it("監査保存に失敗した初回タスクと受入記録をbatch全体でrollbackする", async () => {
  const { db, member, request } = fixture();
  const email = "rollback-member@atlasez.test";
  member(email);
  db.exec(
    "CREATE TRIGGER fail_intake_audit BEFORE INSERT ON admin_audit_log WHEN NEW.action='member_intake_updated' BEGIN SELECT RAISE(ABORT,'isolated audit failure'); END",
  );
  const response = await request(
    "/api/admin/member-intake?project=thinking-cafe",
    "PUT",
    {
      email,
      expectedRevision: 0,
      responsibleEmail: "manager@atlasez.test",
      consultationEmail: "manager@atlasez.test",
      contactStatus: "contacted",
      contactNote: "welcome",
      firstTaskTitle: "atomic first task",
      followUpAt: null,
      followUpCompleted: false,
    },
  );
  expect(response.status).toBe(500);
  expect(
    db
      .prepare("SELECT COUNT(*) AS count FROM editorial_member_intake_tracking")
      .get(),
  ).toEqual({ count: 0 });
  expect(
    db.prepare("SELECT COUNT(*) AS count FROM editorial_tasks").get(),
  ).toEqual({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM admin_audit_log WHERE action='member_intake_updated'",
      )
      .get(),
  ).toEqual({ count: 0 });
  expect(fetch).not.toHaveBeenCalled();
});

it("本人案内は他人の指定を無視して自分だけを返し、試験化された初回タスクを隠す", async () => {
  const { db, member, request } = fixture();
  const email = "own-member@atlasez.test";
  member(email);
  member("other-member@atlasez.test");
  const save = (target: string) =>
    request("/api/admin/member-intake?project=thinking-cafe", "PUT", {
      email: target,
      expectedRevision: 0,
      responsibleEmail: "manager@atlasez.test",
      consultationEmail: "manager@atlasez.test",
      contactStatus: "contacted",
      contactNote: `${target} private staff note`,
      firstTaskTitle: "first safe task",
      followUpAt: "2026-11-01T00:00:00.000Z",
      followUpCompleted: false,
    });
  expect((await save(email)).status).toBe(200);
  expect((await save("other-member@atlasez.test")).status).toBe(200);
  const own = await request(
    "/api/admin/my-intake?email=other-member@atlasez.test",
    "GET",
    undefined,
    email,
  );
  expect(own.status, await own.clone().text()).toBe(200);
  const original = (await own.json()) as {
    entries: Array<Record<string, unknown>>;
  };
  expect(original.entries).toHaveLength(1);
  expect(original.entries[0].first_task_id).toBeTruthy();
  expect(original.entries[0]).not.toHaveProperty("contact_note");
  expect(original.entries[0]).not.toHaveProperty("email");
  db.prepare(
    "UPDATE editorial_tasks SET is_test_data=1 WHERE assignee_email=?",
  ).run(email);
  const masked = await request("/api/admin/my-intake", "GET", undefined, email);
  expect((await masked.json()) as unknown).toMatchObject({
    entries: [
      {
        first_task_id: null,
        first_task_title: "",
        first_task_status: null,
        follow_up_at: "2026-11-01T00:00:00.000Z",
      },
    ],
  });
  expect(fetch).not.toHaveBeenCalled();
});
