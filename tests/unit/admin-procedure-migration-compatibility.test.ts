import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";

it("0127は既存の全申請状態を保持し旧WorkerのINSERT・一覧SELECTも受け付ける", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const directory = new URL("../../migrations/", import.meta.url);
    for (const file of readdirSync(directory)
      .filter((name) => name.endsWith(".sql") && name < "0127")
      .sort())
      db.exec(readFileSync(new URL(file, directory), "utf8"));
    const columns =
      "id,project_id,email,procedure_type,effective_from,effective_until,reason,note,status,created_at,updated_at";
    const insert = `INSERT INTO atlasez_member_procedure_requests (${columns}) VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
    const states = ["pending", "reviewing", "completed", "cancelled"];
    for (const [index, state] of states.entries())
      db.prepare(insert).run(
        `old-${index}`,
        "atlas",
        `member${index}@example.test`,
        index % 2 ? "withdrawal" : "pause",
        "2026-10-01",
        "2026-12-01",
        "既存の理由",
        "既存の申し送り",
        state,
        "2026-09-01T00:00:00Z",
        "2026-09-02T00:00:00Z",
      );
    const before = db
      .prepare(
        `SELECT ${columns} FROM atlasez_member_procedure_requests ORDER BY id`,
      )
      .all();
    db.exec(
      readFileSync(
        new URL("0127_project_member_procedures.sql", directory),
        "utf8",
      ),
    );
    expect(
      db
        .prepare(
          `SELECT ${columns} FROM atlasez_member_procedure_requests ORDER BY id`,
        )
        .all(),
    ).toEqual(before);
    db.prepare(insert).run(
      "old-writer-after-migration",
      "atlas",
      "legacy@example.test",
      "pause",
      "2026-10-06",
      "",
      "旧Workerからの理由",
      "",
      "pending",
      "2026-10-05T00:00:00Z",
      "2026-10-05T00:00:00Z",
    );
    expect(
      db
        .prepare(
          "SELECT timezone,effective_at,expected_state FROM atlasez_member_procedure_requests WHERE id='old-writer-after-migration'",
        )
        .get(),
    ).toEqual({
      timezone: "Asia/Tokyo",
      effective_at: null,
      expected_state: "active",
    });
    const legacyRead = db
      .prepare(
        `SELECT id,procedure_type,effective_from,effective_until,reason,note,status,created_at,updated_at FROM atlasez_member_procedure_requests WHERE project_id=? AND lower(email)=lower(?) ORDER BY created_at DESC LIMIT 20`,
      )
      .all("atlas", "legacy@example.test");
    expect(legacyRead).toHaveLength(1);
    expect(legacyRead[0].reason).toBe("旧Workerからの理由");
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    db.close();
  }
});
