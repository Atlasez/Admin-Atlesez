import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import type {
  D1Database,
  D1PreparedStatement,
} from "../../src/lib/admin-database";
import {
  dispatchTaskTemplates,
  handleTaskTemplates,
  createTemplateTask,
  type TaskTemplate,
} from "../../src/lib/admin-task-templates";
import { nextTemplateOccurrence } from "../../src/lib/task-template-schedule";
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    `CREATE TABLE atlasez_projects(id TEXT PRIMARY KEY);INSERT INTO atlasez_projects VALUES ('atlas');CREATE TABLE atlasez_project_memberships(project_id TEXT,email TEXT,role TEXT);INSERT INTO atlasez_project_memberships VALUES ('atlas','owner@example.com','manager'),('atlas','a@example.com','member');CREATE TABLE report_admin_permissions(email TEXT,subject TEXT);CREATE TABLE editorial_member_profiles(email TEXT,display_name TEXT);CREATE TABLE editorial_tasks(id TEXT PRIMARY KEY,project_id TEXT,assignee_email TEXT,title TEXT,details TEXT,status TEXT,due_at TEXT,due_timezone TEXT,created_by TEXT,created_at TEXT,updated_at TEXT);`,
  );
  sqlite.exec(
    readFileSync(
      new URL(
        "../../migrations/0121_editorial_task_templates.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  class Statement implements D1PreparedStatement {
    values: (string | number | null)[] = [];
    constructor(readonly sql: string) {}
    bind(...values: unknown[]) {
      this.values = values as typeof this.values;
      return this;
    }
    execute() {
      const r = sqlite.prepare(this.sql).run(...this.values);
      return { results: [], meta: { changes: Number(r.changes) } };
    }
    async run() {
      return this.execute();
    }
    async first<T>() {
      return (sqlite.prepare(this.sql).get(...this.values) as T) ?? null;
    }
    async all<T>() {
      return { results: sqlite.prepare(this.sql).all(...this.values) as T[] };
    }
  }
  const db: D1Database = {
    prepare: (sql) => new Statement(sql),
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const result = statements.map((statement) =>
          (statement as Statement).execute(),
        );
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const seed = () => {
    sqlite
      .prepare(
        `INSERT INTO editorial_task_templates(id,owner_email,project_id,name,title,assignees_json,timezone,schedule,anchor_at,due_after_days,enabled,next_run_at,created_at,updated_at) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','owner@example.com','atlas','定例','週報','["a@example.com"]','Asia/Tokyo','monthly','2026-01-31T09:00',2,1,'2026-01-31T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`,
      )
      .run();
    return sqlite
      .prepare("SELECT * FROM editorial_task_templates")
      .get() as TaskTemplate;
  };
  const context = {
    db,
    email: "owner@example.com",
    primaryEmail: "primary@example.com",
    projects: [{ id: "atlas", name: "Atlas", role: "manager" }],
  };
  return { db, sqlite, seed, context };
}
const now = new Date("2026-02-01T00:00:00.000Z");
describe("タスクテンプレートの作成・定期実行", () => {
  it("preserves the monthly anchor and skips nonexistent DST times", () => {
    expect(
      nextTemplateOccurrence(
        "2026-01-31T09:00",
        "Asia/Tokyo",
        "monthly",
        "2026-02-28T00:00:00.000Z",
      ),
    ).toBe("2026-03-31T00:00:00.000Z");
    expect(
      nextTemplateOccurrence(
        "2026-03-07T02:30",
        "America/New_York",
        "daily",
        "2026-03-07T07:30:00.000Z",
      ),
    ).toBe("2026-03-09T06:30:00.000Z");
  });
  it("creates one task when cron executions overlap, then advances to a future anchored occurrence", async () => {
    const { db, sqlite, seed } = fixture();
    seed();
    await Promise.all([
      dispatchTaskTemplates(db, "primary@example.com", now),
      dispatchTaskTemplates(db, "primary@example.com", now),
    ]);
    expect(
      sqlite.prepare("SELECT COUNT(*) AS count FROM editorial_tasks").get()
        ?.count,
    ).toBe(1);
    expect(
      sqlite.prepare("SELECT next_run_at FROM editorial_task_templates").get()
        ?.next_run_at,
    ).toBe("2026-02-28T00:00:00.000Z");
    expect(
      sqlite.prepare("SELECT due_at FROM editorial_tasks").get()?.due_at,
    ).toBe("2026-02-02T09:00");
    sqlite.close();
  });
  it("stops creating tasks after manager authority is revoked", async () => {
    const { db, sqlite, seed } = fixture();
    seed();
    sqlite.exec(
      "UPDATE atlasez_project_memberships SET role='member' WHERE email='owner@example.com'",
    );
    const result = await dispatchTaskTemplates(db, "primary@example.com", now);
    expect(result.failed).toBe(1);
    expect(
      sqlite.prepare("SELECT COUNT(*) AS count FROM editorial_tasks").get()
        ?.count,
    ).toBe(0);
    expect(
      sqlite.prepare("SELECT enabled FROM editorial_task_templates").get()
        ?.enabled,
    ).toBe(0);
    sqlite.close();
  });
  it("reuses the task id on a repeated manual request and guards against a stale template snapshot", async () => {
    const { db, sqlite, seed } = fixture();
    const row = seed();
    const first = await createTemplateTask(
      db,
      row,
      "primary@example.com",
      now.toISOString(),
      "manual:key",
    );
    const second = await createTemplateTask(
      db,
      row,
      "primary@example.com",
      now.toISOString(),
      "manual:key",
    );
    expect(second.taskId).toBe(first.taskId);
    expect(second.created).toBe(false);
    sqlite.exec(
      "UPDATE editorial_task_templates SET updated_at='2026-02-02T00:00:00.000Z'",
    );
    await expect(
      createTemplateTask(
        db,
        row,
        "primary@example.com",
        now.toISOString(),
        "manual:new",
      ),
    ).rejects.toThrow("変更された");
    expect(
      sqlite.prepare("SELECT COUNT(*) AS count FROM editorial_tasks").get()
        ?.count,
    ).toBe(1);
    sqlite.close();
  });
  it("hides another owner’s template and forces ordinary members to assign only themselves", async () => {
    const { sqlite, seed, context } = fixture();
    seed();
    const request = (path: string, body: unknown) =>
      new Request("https://admin.example" + path, {
        method: "POST",
        headers: {
          origin: "https://admin.example",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const other = await handleTaskTemplates(
      request(
        "/api/admin/task-templates/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/create",
        { idempotencyKey: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
      ),
      { ...context, email: "a@example.com" },
    );
    expect(other.status).toBe(404);
    const response = await handleTaskTemplates(
      request("/api/admin/task-templates", {
        projectId: "atlas",
        name: "個人用",
        title: "自分のタスク",
        schedule: "none",
        assignees: ["owner@example.com"],
        dueAfterDays: null,
      }),
      {
        ...context,
        email: "a@example.com",
        projects: [{ id: "atlas", name: "Atlas", role: "member" }],
      },
    );
    expect(response.status).toBe(200);
    expect(
      sqlite
        .prepare(
          "SELECT assignees_json,due_after_days FROM editorial_task_templates WHERE owner_email='a@example.com'",
        )
        .get(),
    ).toMatchObject({
      assignees_json: '["a@example.com"]',
      due_after_days: null,
    });
    sqlite.close();
  });
});
