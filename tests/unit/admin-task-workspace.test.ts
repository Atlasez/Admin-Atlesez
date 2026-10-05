import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  D1Database,
  D1PreparedStatement,
} from "../../src/lib/admin-database";
import {
  handleTaskWorkspace,
  normalizeWorkspace,
  type TaskWorkspaceContext,
  type WorkspaceTask,
} from "../../src/lib/admin-task-workspace";

const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  c = "33333333-3333-4333-8333-333333333333";
const owner = "owner@example.com",
  next = "next@example.com";
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE editorial_tasks(id TEXT PRIMARY KEY,project_id TEXT,subject TEXT,title TEXT,status TEXT,assignee_email TEXT,updated_at TEXT,archived_at TEXT);
    CREATE TABLE atlasez_project_memberships(project_id TEXT,email TEXT);
    CREATE TABLE atlasez_project_member_lifecycle(project_id TEXT,email TEXT,state TEXT);
    CREATE TABLE admin_member_lifecycle(email TEXT,status TEXT);
    CREATE TABLE editorial_member_profiles(email TEXT,display_name TEXT);
    CREATE TABLE admin_audit_log(id TEXT PRIMARY KEY,actor_email TEXT,action TEXT,target_type TEXT,target_id TEXT,target_label TEXT,summary TEXT,details_json TEXT,created_at TEXT);`);
  sqlite.exec(
    readFileSync(
      new URL("../../migrations/0123_task_workspaces.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const id of [a, b, c])
    sqlite
      .prepare(
        "INSERT INTO editorial_tasks VALUES (?,'atlas','math',?,'open',?,'2026-10-01T00:00:00Z',NULL)",
      )
      .run(id, `task ${id}`, owner);
  sqlite
    .prepare(
      "INSERT INTO atlasez_project_memberships VALUES ('atlas',?),('atlas',?)",
    )
    .run(owner, next);
  const stored = new WeakMap<
    D1PreparedStatement,
    () => { results: unknown[]; meta: { changes: number } }
  >();
  let failAudit = false;
  let beforeBatch = () => {};
  const db: D1Database = {
    prepare(query) {
      let bindings: (string | number | null)[] = [];
      const run = () => {
        if (failAudit && query.includes("INSERT INTO admin_audit_log"))
          throw new Error("audit unavailable");
        const result = sqlite.prepare(query).run(...bindings);
        return { results: [], meta: { changes: Number(result.changes) } };
      };
      const statement: D1PreparedStatement = {
        bind(...values) {
          bindings = values as typeof bindings;
          return this;
        },
        async first<T>() {
          return (sqlite.prepare(query).get(...bindings) as T) ?? null;
        },
        async all<T>() {
          return { results: sqlite.prepare(query).all(...bindings) as T[] };
        },
        async run() {
          return run();
        },
      };
      stored.set(statement, run);
      return statement;
    },
    async batch<T>(statements: D1PreparedStatement[]) {
      beforeBatch();
      sqlite.exec("BEGIN");
      try {
        const result = statements.map((statement) => stored.get(statement)!());
        sqlite.exec("COMMIT");
        return result as Array<{ results: T[]; meta: { changes: number } }>;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const context: TaskWorkspaceContext = {
    db,
    email: owner,
    access: async (id) => {
      const task = sqlite
        .prepare("SELECT * FROM editorial_tasks WHERE id=?")
        .get(id) as WorkspaceTask | undefined;
      return task?.project_id === "atlas"
        ? { task, canEdit: true, canAssign: true }
        : null;
    },
    documentAllowed: async () => true,
    candidates: async () => [],
  };
  const input = (extra: Record<string, unknown> = {}) => ({
    revision: 0,
    expectedUpdatedAt: "2026-10-01T00:00:00Z",
    summary: "現在の状況",
    nextAction: "参考文献を確認",
    waitingFor: "確認担当の返信",
    documentId: "",
    checklist: [{ id: crypto.randomUUID(), label: "内容を確認", done: false }],
    dependencyIds: [],
    ...extra,
  });
  const save = (id: string, body = input()) =>
    handleTaskWorkspace(
      new Request(`https://admin.example/api/admin/task-workspaces/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
      id,
      context,
    );
  return {
    sqlite,
    db,
    context,
    input,
    save,
    setBeforeBatch: (callback: () => void) => {
      beforeBatch = callback;
    },
    setFailAudit: () => {
      failAudit = true;
    },
  };
}
describe("task workspaces", () => {
  it("atomically transfers a task, records its context and audits the change", async () => {
    const { sqlite, save, input } = fixture();
    const result = await save(
      a,
      input({ handoff: true, assigneeEmails: [next], dependencyIds: [b] }),
    );
    expect(result.status).toBe(200);
    expect(
      sqlite
        .prepare("SELECT assignee_email FROM editorial_tasks WHERE id=?")
        .get(a),
    ).toMatchObject({ assignee_email: next });
    expect(
      sqlite.prepare("SELECT * FROM editorial_task_handoffs").get(),
    ).toMatchObject({
      summary: "現在の状況",
      next_action: "参考文献を確認",
      from_assignees: owner,
      to_assignees: next,
    });
    expect(sqlite.prepare("SELECT * FROM admin_audit_log").get()).toMatchObject(
      { action: "task_workspace_updated", target_id: a },
    );
  });
  it("rejects another project's assignee and non-manager reassignment", async () => {
    const { save, input, context, sqlite } = fixture();
    expect(
      (
        await save(
          a,
          input({ handoff: true, assigneeEmails: ["outsider@example.com"] }),
        )
      ).status,
    ).toBe(403);
    const access = context.access;
    context.access = async (id) => {
      const result = await access(id);
      return result ? { ...result, canAssign: false } : null;
    };
    expect(
      (await save(a, input({ handoff: true, assigneeEmails: [next] }))).status,
    ).toBe(403);
    expect(
      sqlite
        .prepare("SELECT count(*) AS n FROM editorial_task_workspaces")
        .get(),
    ).toMatchObject({ n: 0 });
  });
  it("rejects paused or withdrawn members as new handoff recipients", async () => {
    const { save, input, sqlite } = fixture();
    sqlite
      .prepare(
        "INSERT INTO atlasez_project_member_lifecycle(project_id,email,state) VALUES ('atlas',?,'paused')",
      )
      .run(next);
    expect(
      (await save(a, input({ handoff: true, assigneeEmails: [next] }))).status,
    ).toBe(403);
    expect(
      sqlite
        .prepare("SELECT assignee_email FROM editorial_tasks WHERE id=?")
        .get(a),
    ).toMatchObject({ assignee_email: owner });
  });
  it("does not offer inactive members in the handoff recipient list", async () => {
    const { context, sqlite } = fixture();
    sqlite
      .prepare(
        "INSERT INTO atlasez_project_member_lifecycle(project_id,email,state) VALUES ('atlas',?,'paused')",
      )
      .run(next);
    const result = await handleTaskWorkspace(
      new Request("https://admin.example/api/admin/task-workspaces/" + a),
      a,
      context,
    );
    expect(await result.json()).toMatchObject({
      members: [{ email: owner }],
    });
  });
  it("rechecks recipient lifecycle in the atomic handoff write", async () => {
    const { save, input, sqlite, setBeforeBatch } = fixture();
    setBeforeBatch(() => {
      sqlite
        .prepare(
          "INSERT INTO atlasez_project_member_lifecycle(project_id,email,state) VALUES ('atlas',?,'withdrawn')",
        )
        .run(next);
    });
    expect(
      (await save(a, input({ handoff: true, assigneeEmails: [next] }))).status,
    ).toBe(409);
    expect(
      sqlite
        .prepare("SELECT assignee_email FROM editorial_tasks WHERE id=?")
        .get(a),
    ).toMatchObject({ assignee_email: owner });
  });
  it("rejects self-links, invisible dependencies, cross-project links and cycles", async () => {
    const { save, input, sqlite } = fixture();
    expect((await save(a, input({ dependencyIds: [a] }))).status).toBe(400);
    sqlite
      .prepare("UPDATE editorial_tasks SET project_id='secretariat' WHERE id=?")
      .run(c);
    expect((await save(a, input({ dependencyIds: [c] }))).status).toBe(400);
    expect((await save(a, input({ dependencyIds: [b] }))).status).toBe(200);
    expect((await save(b, input({ dependencyIds: [a] }))).status).toBe(409);
  });
  it("does not overwrite a concurrent edit even when timestamps match", async () => {
    const { save, input, sqlite } = fixture();
    expect((await save(a)).status).toBe(200);
    sqlite
      .prepare(
        "UPDATE editorial_tasks SET updated_at='2026-10-01T00:00:00Z' WHERE id=?",
      )
      .run(a);
    expect((await save(a, input({ summary: "古い入力" }))).status).toBe(409);
    expect(
      sqlite
        .prepare(
          "SELECT summary FROM editorial_task_workspaces WHERE task_id=?",
        )
        .get(a),
    ).toMatchObject({ summary: "現在の状況" });
  });
  it("rolls back assignment and metadata when the audit insert fails", async () => {
    const { save, input, sqlite, setFailAudit } = fixture();
    setFailAudit();
    await expect(
      save(a, input({ handoff: true, assigneeEmails: [next] })),
    ).rejects.toThrow("audit unavailable");
    expect(
      sqlite
        .prepare("SELECT assignee_email FROM editorial_tasks WHERE id=?")
        .get(a),
    ).toMatchObject({ assignee_email: owner });
    expect(
      sqlite
        .prepare("SELECT count(*) AS n FROM editorial_task_workspaces")
        .get(),
    ).toMatchObject({ n: 0 });
  });
  it("checks revisions again inside the atomic write", async () => {
    const { save, input, sqlite, setBeforeBatch } = fixture();
    setBeforeBatch(() => {
      sqlite
        .prepare(
          `INSERT INTO editorial_task_workspaces(task_id,summary,revision,operation_id,updated_by,updated_at)
        VALUES (?, '先に保存した内容', 1, 'race', ?, '2026-10-01')`,
        )
        .run(a, owner);
    });
    expect((await save(a, input({ summary: "古い入力" }))).status).toBe(409);
    expect(
      sqlite
        .prepare(
          "SELECT summary FROM editorial_task_workspaces WHERE task_id=?",
        )
        .get(a),
    ).toMatchObject({ summary: "先に保存した内容" });
    expect(
      sqlite.prepare("SELECT count(*) AS n FROM admin_audit_log").get(),
    ).toMatchObject({ n: 0 });
  });
  it("rejects a cycle introduced between validation and the write", async () => {
    const { save, input, sqlite, setBeforeBatch } = fixture();
    setBeforeBatch(() => {
      sqlite
        .prepare(
          `INSERT INTO editorial_task_workspaces(task_id,dependencies_json,revision,operation_id,updated_by,updated_at)
        VALUES (?, ?, 1, 'race', ?, '2026-10-01')`,
        )
        .run(b, JSON.stringify([a]), owner);
    });
    expect((await save(a, input({ dependencyIds: [b] }))).status).toBe(409);
    expect(
      sqlite
        .prepare(
          "SELECT count(*) AS n FROM editorial_task_workspaces WHERE task_id=?",
        )
        .get(a),
    ).toMatchObject({ n: 0 });
  });
  it("preserves a dependency hidden by a permission change", async () => {
    const { save, input, context, sqlite } = fixture();
    expect((await save(a, input({ dependencyIds: [b] }))).status).toBe(200);
    const access = context.access;
    context.access = async (id) => (id === b ? null : access(id));
    const task = sqlite
      .prepare("SELECT updated_at FROM editorial_tasks WHERE id=?")
      .get(a) as { updated_at: string };
    expect(
      (
        await save(
          a,
          input({
            revision: 1,
            expectedUpdatedAt: task.updated_at,
            dependencyIds: [],
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      sqlite
        .prepare(
          "SELECT dependencies_json FROM editorial_task_workspaces WHERE task_id=?",
        )
        .get(a),
    ).toMatchObject({ dependencies_json: JSON.stringify([b]) });
  });
  it("keeps read responses free of other members' email addresses and hides restricted references", async () => {
    const { save, input, context } = fixture();
    await save(
      a,
      input({
        handoff: true,
        assigneeEmails: [next],
        dependencyIds: [b],
        documentId: c,
      }),
    );
    const access = context.access;
    context.access = async (id) => {
      if (id === b) return null;
      const result = await access(id);
      return result ? { ...result, canAssign: false } : null;
    };
    context.documentAllowed = async () => false;
    const result = await handleTaskWorkspace(
      new Request("https://admin.example/"),
      a,
      context,
    );
    const text = await result.text();
    expect(text).not.toContain(owner);
    expect(text).not.toContain(next);
    expect(text).not.toContain(b);
    expect(text).not.toContain(c);
    expect(JSON.parse(text)).toMatchObject({
      workspace: { documentId: null, documentRestricted: true },
      dependencies: [{ id: null, available: false }],
    });
  });
  it("rejects archived writes and read-only access and handles absent migration", async () => {
    const { save, context, sqlite } = fixture();
    sqlite
      .prepare("UPDATE editorial_tasks SET archived_at='2026-10-01' WHERE id=?")
      .run(a);
    expect((await save(a)).status).toBe(403);
    context.access = async () => null;
    expect((await save(a)).status).toBe(404);
    const other = fixture();
    other.sqlite.exec("DROP TABLE editorial_task_workspaces");
    expect((await other.save(a)).status).toBe(503);
  });
  it("requires complete handoff context and bounds checklist input", () => {
    const { input } = fixture();
    expect(() =>
      normalizeWorkspace(input({ handoff: true, nextAction: "" })),
    ).toThrow();
    expect(() =>
      normalizeWorkspace(input({ assigneeEmails: [next] })),
    ).toThrow();
    expect(() =>
      normalizeWorkspace(
        input({
          checklist: Array.from({ length: 31 }, () => ({
            id: crypto.randomUUID(),
            label: "項目",
            done: false,
          })),
        }),
      ),
    ).toThrow();
  });
});
