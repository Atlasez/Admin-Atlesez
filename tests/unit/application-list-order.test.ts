import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";

it("応募一覧は状態より応募日時を優先し、300件の制限より先に最新順にする", () => {
  const source = readFileSync(
    new URL("../../src/admin-worker.ts", import.meta.url),
    "utf8",
  );
  const body = source
    .split("async function listApplications(")[1]
    .split("async function updateApplication(")[0];
  const order = body.match(/ORDER BY[^`]+/)?.[0];
  expect(order).toBeDefined();
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE applications (id TEXT, status TEXT, created_at TEXT)",
    );
    const insert = db.prepare("INSERT INTO applications VALUES (?, ?, ?)");
    for (let index = 0; index < 300; index++)
      insert.run(`old-${index}`, "new", "2026-09-01T00:00:00Z");
    insert.run("latest-a", "accepted", "2026-09-04T00:00:00Z");
    insert.run("latest-b", "reviewing", "2026-09-04T00:00:00Z");
    const rows = db.prepare(`SELECT id FROM applications a ${order}`).all();
    expect(rows).toHaveLength(300);
    expect(rows.slice(0, 2).map((row) => row.id)).toEqual([
      "latest-b",
      "latest-a",
    ]);
  } finally {
    db.close();
  }
});
