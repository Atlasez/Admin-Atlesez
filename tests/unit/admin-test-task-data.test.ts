import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import worker from "../../src/admin-worker";
import {
  dispatchDueTaskReminders,
  type TaskReminderDeliveryEnv,
} from "../../src/lib/task-reminder-delivery";

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
      batch: async (statements: Statement[]) => {
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
        }
      },
    },
    ASSETS: {
      fetch: async () =>
        new Response("isolated", { headers: { "content-type": "text/html" } }),
    },
  };
  const now = new Date().toISOString();
  const createMember = (email: string, role: string) =>
    db
      .prepare(
        "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('thinking-cafe',?,?,?)",
      )
      .run(email, role, now);
  createMember("manager@atlasez.test", "manager");
  createMember("member@atlasez.test", "member");
  for (const email of ["manager@atlasez.test", "member@atlasez.test"]) {
    db.prepare(
      "INSERT INTO editorial_member_profiles(email,display_name,bio,updated_at) VALUES (?,?,?,?)",
    ).run(email, email.split("@")[0], "共通プロフィール", now);
    db.prepare(
      "INSERT INTO editorial_project_member_profiles(project_id,email,internal_bio,updated_at) VALUES ('thinking-cafe',?,?,?)",
    ).run(email, "運営プロフィール", now);
  }
  const request = (
    email: string,
    path: string,
    method = "GET",
    body?: unknown,
  ) => {
    const token = `test-task-${email}`;
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
  return { db, request, now };
}

it("運営が作るテストタスクは明示マーカー付きで通常一覧・リマインダー配送から除外される", async () => {
  const { db, request } = fixture();
  const created = await request(
    "manager@atlasez.test",
    "/api/admin/operations/tasks",
    "POST",
    {
      projectId: "thinking-cafe",
      title: "通知抑止テスト",
      assigneeEmail: "member@atlasez.test",
      dueAt: "2026-10-05T09:00",
      dueTimezone: "Asia/Tokyo",
      reminderAt: "2030-01-01T09:00",
      reminderEmail: "member@atlasez.test",
      isTestData: true,
    },
  );
  expect(created.status, await created.clone().text()).toBe(200);
  const task = db
    .prepare(
      "SELECT id,is_test_data,reminder_at,reminder_email FROM editorial_tasks WHERE title='通知抑止テスト'",
    )
    .get() as Record<string, unknown>;
  expect(task).toMatchObject({
    is_test_data: 1,
    reminder_at: null,
    reminder_email: null,
  });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_task_reminders WHERE task_id=?",
      )
      .get(String(task.id)),
  ).toEqual({ count: 0 });

  const normal = await request(
    "manager@atlasez.test",
    "/api/admin/member-tasks?project=thinking-cafe",
  );
  expect(normal.status, await normal.clone().text()).toBe(200);
  expect(
    ((await normal.json()) as { tasks: Array<{ id: string }> }).tasks.map(
      (row) => row.id,
    ),
  ).not.toContain(task.id);
  const testView = await request(
    "manager@atlasez.test",
    "/api/admin/member-tasks?project=thinking-cafe&includeTestData=1",
  );
  expect(
    (
      (await testView.json()) as {
        tasks: Array<{ id: string; is_test_data: number }>;
      }
    ).tasks,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: task.id, is_test_data: 1 }),
    ]),
  );

  for (const path of [
    "/api/admin/portal?timezone=Asia%2FTokyo",
    "/api/admin/member-calendar?project=thinking-cafe&month=2026-10",
    "/api/admin/notifications",
    "/api/admin/command-search?q=%E9%80%9A%E7%9F%A5%E6%8A%91%E6%AD%A2%E3%83%86%E3%82%B9%E3%83%88",
  ]) {
    const response = await request(
      path.startsWith("/api/admin/command-search")
        ? "global@atlasez.test"
        : "member@atlasez.test",
      path,
    );
    expect(response.status, `${path}: ${await response.clone().text()}`).toBe(
      200,
    );
    const data = (await response.json()) as { results?: unknown };
    const content = JSON.stringify(
      path.startsWith("/api/admin/command-search") ? data.results : data,
    );
    expect(content, path).not.toContain(String(task.id));
    expect(content, path).not.toContain("通知抑止テスト");
  }

  const memberCreate = await request(
    "member@atlasez.test",
    "/api/admin/operations/tasks",
    "POST",
    {
      projectId: "thinking-cafe",
      title: "拒否されるテストタスク",
      isTestData: true,
    },
  );
  expect(memberCreate.status).toBe(403);
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_tasks WHERE title='拒否されるテストタスク'",
      )
      .get(),
  ).toEqual({ count: 0 });
});

it("通常タスクをテスト扱いにすると運営だけが変更でき、既存リマインダーを消す", async () => {
  const { db, request, now } = fixture();
  const taskId = "33333333-3333-4333-8333-333333333333";
  db.prepare(
    "INSERT INTO editorial_tasks(id,project_id,assignee_email,title,details,status,due_timezone,reminder_email,created_by,created_at,updated_at) VALUES (?,'thinking-cafe','member@atlasez.test','既存タスク','','open','Asia/Tokyo','member@atlasez.test','manager@atlasez.test',?,?)",
  ).run(taskId, now, now);
  db.prepare(
    "INSERT INTO editorial_task_reminders(id,task_id,remind_at,remind_at_utc,timezone,label,created_at) VALUES (? ,?, '2026-10-05T09:00','2026-10-05T00:00:00.000Z','Asia/Tokyo','test',?)",
  ).run("44444444-4444-4444-8444-444444444444", taskId, now);
  const denied = await request(
    "member@atlasez.test",
    `/api/admin/operations/tasks/${taskId}`,
    "PATCH",
    { isTestData: true },
  );
  expect(denied.status).toBe(403);
  const changed = await request(
    "manager@atlasez.test",
    `/api/admin/operations/tasks/${taskId}`,
    "PATCH",
    { isTestData: true },
  );
  expect(changed.status, await changed.clone().text()).toBe(200);
  expect(
    db
      .prepare(
        "SELECT is_test_data,reminder_email FROM editorial_tasks WHERE id=?",
      )
      .get(taskId),
  ).toEqual({ is_test_data: 1, reminder_email: null });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_task_reminders WHERE task_id=?",
      )
      .get(taskId),
  ).toEqual({ count: 0 });

  // Also verify the delivery worker ignores marked rows if a legacy/manual row reappears.
  db.prepare(
    "UPDATE editorial_tasks SET reminder_email='member@atlasez.test' WHERE id=?",
  ).run(taskId);
  db.prepare(
    "INSERT INTO editorial_task_reminders(id,task_id,remind_at,remind_at_utc,timezone,label,created_at) VALUES ('55555555-5555-4555-8555-555555555555',?,'2026-10-04T20:00','2026-10-04T11:00:00.000Z','Asia/Tokyo','test',?)",
  ).run(taskId, now);
  let sends = 0;
  const deliveryEnv = {
    REPORTS: {
      prepare: (query: string) => new Statement(query, db),
      batch: async (statements: Statement[]) => {
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
        }
      },
    },
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "Atlasez <noreply@atlasez.test>",
  } as unknown as TaskReminderDeliveryEnv;
  await dispatchDueTaskReminders(deliveryEnv, {
    now: new Date(now),
    fetcher: async () => {
      sends += 1;
      return new Response(null, { status: 200 });
    },
    logger: { info() {}, error() {} },
  });
  expect(sends).toBe(0);
});
