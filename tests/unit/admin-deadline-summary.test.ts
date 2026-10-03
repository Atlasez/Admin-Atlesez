import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  deadlineSummarySql,
  taskDeadlineEpoch,
} from "../../src/lib/admin-deadline-summary";

describe("task deadlines across timezones", () => {
  it("parses local deadlines in their stored zone and preserves legacy ISO instants", () => {
    expect(taskDeadlineEpoch("2026-10-03T08:00", "Asia/Tokyo")).toBe(
      Date.parse("2026-10-02T23:00:00Z"),
    );
    expect(taskDeadlineEpoch("2026-10-03T08:00", "America/New_York")).toBe(
      Date.parse("2026-10-03T12:00:00Z"),
    );
    expect(taskDeadlineEpoch("2026-10-03T08:00:00Z", "Asia/Tokyo")).toBe(
      Date.parse("2026-10-03T08:00:00Z"),
    );
    expect(
      taskDeadlineEpoch("2026-10-03T08:00:00+09:00", "America/New_York"),
    ).toBe(Date.parse("2026-10-02T23:00:00Z"));
    expect(taskDeadlineEpoch("2026-03-08T02:30", "America/New_York")).toBeNaN();
  });

  it("counts local and legacy deadlines at the viewer's day boundary without reading all task rows", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec("CREATE TABLE editorial_tasks(due_at TEXT,due_timezone TEXT)");
      const insert = db.prepare("INSERT INTO editorial_tasks VALUES(?,?)");
      // Tokyo Oct 3 ends at Oct 3 15:00Z, which is New York Oct 3 11:00.
      for (const row of [
        ["2026-10-03T23:59", "Asia/Tokyo"],
        ["2026-10-03T10:59", "America/New_York"],
        ["2026-10-03T14:59:00Z", "Asia/Tokyo"],
        ["2026-10-04T00:00", "Asia/Tokyo"],
        ["2026-10-03T11:00", "America/New_York"],
        ["2026-10-03T15:00:00Z", "America/New_York"],
        ["2026-10-11T00:00", "Asia/Tokyo"],
      ])
        insert.run(...row);
      const sql = deadlineSummarySql(
        ["Asia/Tokyo", "America/New_York"],
        "Asia/Tokyo",
        new Date("2026-10-03T00:00:00Z"),
      );
      const counts = db
        .prepare(
          `SELECT SUM(CASE WHEN ${sql.today} THEN 1 ELSE 0 END) today,SUM(CASE WHEN ${sql.soon} THEN 1 ELSE 0 END) soon FROM editorial_tasks t`,
        )
        .get(...sql.values);
      expect(counts).toEqual({ today: 3, soon: 3 });
    } finally {
      db.close();
    }
  });

  it("uses the 25-hour DST day in the viewer's timezone", () => {
    const sql = deadlineSummarySql(
      ["Asia/Tokyo"],
      "America/New_York",
      new Date("2026-11-01T04:30:00Z"),
    );
    expect(sql.values[0]).toBe("2026-11-02T05:00:00Z");
    expect(taskDeadlineEpoch("2026-11-01T01:30", "America/New_York")).toBeNaN();
  });
});
