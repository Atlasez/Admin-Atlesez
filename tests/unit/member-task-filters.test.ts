import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { memberTaskFilters } from "../../src/lib/member-task-filters";
import { formatTaskDeadline } from "../../src/lib/task-deadline";

const now = new Date("2026-09-30T03:00:00Z");
const projects = [
  { id: "atlas", name: "アトラス" },
  { id: "secretariat", name: "事務局" },
];
function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE tasks (id TEXT, project_id TEXT, title TEXT, details TEXT, status TEXT, created_by TEXT, assignee_email TEXT, task_kind TEXT, due_at TEXT, due_timezone TEXT)",
  );
  return db;
}
function select(db: DatabaseSync, params: URLSearchParams, limit = 50) {
  const filter = memberTaskFilters(
    params,
    "me@example.com",
    projects,
    ["Asia/Tokyo", "America/New_York"],
    now,
  );
  return db
    .prepare(
      `SELECT * FROM tasks WHERE 1=1${filter.sql} ORDER BY id LIMIT ${limit}`,
    )
    .all(...(filter.values as (string | number | null)[]));
}
function insert(
  db: DatabaseSync,
  id: string,
  title: string,
  due: string | null = null,
  timezone = "Asia/Tokyo",
  status = "open",
  project = "atlas",
) {
  db.prepare("INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?)").run(
    id,
    project,
    title,
    "",
    status,
    "me@example.com",
    "me@example.com",
    "task",
    due,
    timezone,
  );
}

describe("横断タスクの全件検索と期限", () => {
  it("finds a matching task beyond the first 50 rows and treats SQL metacharacters literally", () => {
    const db = database();
    for (let index = 0; index < 65; index += 1)
      insert(
        db,
        String(index).padStart(3, "0"),
        index === 64 ? "後半の対象 100%_" : "通常タスク",
      );
    expect(select(db, new URLSearchParams({ q: "対象" }))).toHaveLength(1);
    expect(select(db, new URLSearchParams({ q: "100%_" }))).toHaveLength(1);
    expect(select(db, new URLSearchParams({ q: "' OR 1=1 --" }))).toHaveLength(
      0,
    );
    db.close();
  });
  it("intersects selected projects with accessible projects, including an empty selection", () => {
    const db = database();
    insert(db, "a", "a");
    insert(db, "b", "b", null, "Asia/Tokyo", "open", "secretariat");
    expect(
      select(db, new URLSearchParams({ project: "secretariat" })),
    ).toHaveLength(1);
    expect(
      select(db, new URLSearchParams({ project: "private-project" })),
    ).toHaveLength(0);
    expect(select(db, new URLSearchParams({ project: "" }))).toHaveLength(0);
    db.close();
  });
  it("uses viewer day boundaries across task timezones and excludes completed overdue tasks", () => {
    const db = database();
    insert(db, "overdue", "期限切れ", "2026-09-01T10:00");
    insert(db, "today", "今日", "2026-09-30T15:00");
    insert(
      db,
      "ny-today",
      "同じ日の別地域",
      "2026-09-29T12:00",
      "America/New_York",
    );
    insert(db, "tomorrow", "明日", "2026-10-01T09:00");
    insert(db, "done", "完了", "2026-09-01T10:00", "Asia/Tokyo", "done");
    expect(
      select(
        db,
        new URLSearchParams({ due: "today", timezone: "Asia/Tokyo" }),
      ).map((row) => row.id),
    ).toEqual(["ny-today", "today"]);
    expect(
      select(
        db,
        new URLSearchParams({ due: "overdue", timezone: "Asia/Tokyo" }),
      ).map((row) => row.id),
    ).toEqual(["ny-today", "overdue"]);
    db.close();
  });
  it("does not mark an exact deadline as overdue and excludes invalid dates", () => {
    const db = database();
    insert(db, "exact", "今が期限", "2026-09-30T12:00");
    insert(db, "before", "直前が期限", "2026-09-30T11:59");
    insert(db, "invalid", "不正な日付", "invalid");
    expect(
      select(db, new URLSearchParams({ due: "overdue" })).map((row) => row.id),
    ).toEqual(["before"]);
    db.close();
  });
  it("keeps the stored wall clock in its declared timezone", () => {
    expect(formatTaskDeadline("2026-09-30T10:00", "America/New_York")).toBe(
      "2026-09-30 10:00 (America/New_York)",
    );
    expect(formatTaskDeadline("2026-09-30T01:00:00Z", "Asia/Tokyo")).toBe(
      "2026-09-30 10:00 (Asia/Tokyo)",
    );
    expect(formatTaskDeadline("invalid")).toContain("確認してください");
  });
});
