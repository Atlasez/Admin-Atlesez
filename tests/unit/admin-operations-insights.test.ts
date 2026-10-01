import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { D1Database } from "../../src/lib/admin-database";
import { readOperationsInsights } from "../../src/lib/admin-operations-insights";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE editorial_tasks(id TEXT,project_id TEXT,subject TEXT,assignee_email TEXT,task_kind TEXT,status TEXT,due_at TEXT,due_timezone TEXT,created_by TEXT,updated_at TEXT,archived_at TEXT);
    CREATE TABLE editorial_member_profiles(email TEXT,display_name TEXT);
    CREATE TABLE editorial_events(project_id TEXT,subject TEXT);
    CREATE TABLE editorial_progress_reports(project_id TEXT,email TEXT);
    CREATE TABLE editorial_documents(id TEXT,title TEXT,subject TEXT,status TEXT,archived_at TEXT,publication_review_stage TEXT,publication_review_started_at TEXT);`);
  const db: D1Database = {
    prepare(query) {
      let bindings: (string | number | null)[] = [];
      return {
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
          sqlite.prepare(query).run(...bindings);
          return { meta: { changes: 1 } };
        },
      };
    },
    async batch() {
      return [];
    },
  };
  const addTask = (
    id: string,
    assignee: string | null,
    due: string | null,
    subject = "math",
    project = "atlas",
    status = "open",
    timezone = "Asia/Tokyo",
  ) =>
    sqlite
      .prepare("INSERT INTO editorial_tasks VALUES (?,?,?,?,?,?,?,?,?,?,NULL)")
      .run(
        id,
        project,
        subject,
        assignee,
        "task",
        status,
        due,
        timezone,
        "owner@example.com",
        "2026-10-01T00:00:00Z",
      );
  return { sqlite, db, addTask };
}
const now = new Date("2026-10-01T03:00:00Z");
const manager = {
  projectId: "atlas",
  email: "manager@example.com",
  subjects: [],
  allSubjects: true,
};
describe("運営統計の全件・可視範囲集計", () => {
  it("counts beyond the old page cap and splits multiple assignees without inventing people for the wildcard", async () => {
    const { sqlite, db, addTask } = fixture();
    sqlite.exec(
      "INSERT INTO editorial_member_profiles VALUES ('a@example.com','担当A'),('b@example.com','担当B')",
    );
    for (let i = 0; i < 205; i++)
      addTask(
        String(i),
        "a@example.com,b@example.com",
        i === 204 ? "2026-09-30T10:00" : null,
      );
    addTask("unassigned", null, null);
    addTask("wildcard", "*", null);
    addTask(
      "done",
      "a@example.com",
      "2026-09-01T10:00",
      "math",
      "atlas",
      "done",
    );
    const data = await readOperationsInsights(db, manager, now);
    expect(data.tasks).toMatchObject({
      total: 208,
      unfinished: 207,
      overdue: 1,
    });
    expect(data.workload).toContainEqual({
      name: "担当A",
      unfinished: 205,
      doing: 0,
      overdue: 1,
    });
    expect(data.workload).toContainEqual({
      name: "担当B",
      unfinished: 205,
      doing: 0,
      overdue: 1,
    });
    expect(data.workload).toContainEqual({
      name: "未担当",
      unfinished: 1,
      doing: 0,
      overdue: 0,
    });
    expect(data.workload).toContainEqual({
      name: "分野担当者全員",
      unfinished: 1,
      doing: 0,
      overdue: 0,
    });
    expect(JSON.stringify(data)).not.toContain("@example.com");
    sqlite.close();
  });
  it("restricts statistics to the allowed project and subject plus personally assigned tasks", async () => {
    const { sqlite, db, addTask } = fixture();
    addTask("allowed", "other@example.com", null, "math");
    addTask("hidden", "other@example.com", null, "chem");
    addTask("owned", "me@example.com", null, "chem");
    addTask("different-project", "me@example.com", null, "math", "secretariat");
    const data = await readOperationsInsights(
      db,
      {
        ...manager,
        email: "me@example.com",
        subjects: ["math"],
        allSubjects: false,
      },
      now,
    );
    expect(data.tasks.total).toBe(2);
    sqlite.close();
  });
  it("does not substitute document updated_at for missing review start timestamps", async () => {
    const { sqlite, db } = fixture();
    sqlite.exec(
      "INSERT INTO editorial_documents VALUES ('a','古い待ち','math','in-review',NULL,'subject-coordinator','2026-09-29T03:00:00Z'),('b','未記録','math','in-review',NULL,'project-leader',NULL),('c','範囲外','chem','in-review',NULL,'project-leader','2026-09-01T00:00:00Z')",
    );
    const data = await readOperationsInsights(
      db,
      { ...manager, subjects: ["math"], allSubjects: false },
      now,
    );
    expect(data.approval).toMatchObject({
      total: 2,
      unknownStart: 1,
      oldestDays: 2,
    });
    expect(data.waiting.map((row) => row.id)).toEqual(["a", "b"]);
    sqlite.close();
  });
});
