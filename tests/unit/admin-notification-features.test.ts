import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import type { D1Database } from "../../src/lib/admin-database";
import {
  handleNotificationFeatures,
  loadNotificationPreferences,
  notificationFeatureFilter,
} from "../../src/lib/admin-notification-features";
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(
      new URL(
        "../../migrations/0122_admin_notification_preferences.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  sqlite.exec(
    "CREATE TABLE candidates(id TEXT,kind TEXT);CREATE TABLE admin_notification_reads(email TEXT,notification_id TEXT);",
  );
  const db: D1Database = {
    prepare(sql) {
      let values: (string | number | null)[] = [];
      return {
        bind(...bindings) {
          values = bindings as typeof values;
          return this;
        },
        async first<T>() {
          return (sqlite.prepare(sql).get(...values) as T) ?? null;
        },
        async all<T>() {
          return { results: sqlite.prepare(sql).all(...values) as T[] };
        },
        async run() {
          const result = sqlite.prepare(sql).run(...values);
          return { meta: { changes: Number(result.changes) } };
        },
      };
    },
    async batch() {
      return [];
    },
  };
  return { sqlite, db };
}
const request = (
  path: string,
  method: string,
  body: unknown,
  origin = "https://admin.example",
) =>
  new Request("https://admin.example" + path, {
    method,
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
describe("通知設定と再表示予約の永続化・集計", () => {
  it("saves preferences only for the authenticated owner", async () => {
    const { db, sqlite } = fixture();
    const response = await handleNotificationFeatures(
      request("/api/admin/notifications/preferences", "PUT", {
        email: "other@example.com",
        mutedKinds: ["comment"],
        summaryEnabled: false,
      }),
      db,
      "me@example.com",
    );
    expect(response.status).toBe(200);
    expect(
      await loadNotificationPreferences(db, "me@example.com"),
    ).toMatchObject({ mutedKinds: ["comment"], summaryEnabled: false });
    expect(
      sqlite.prepare("SELECT email FROM admin_notification_preferences").get()
        ?.email,
    ).toBe("me@example.com");
    sqlite.close();
  });
  it("applies mute, importance and snooze before LIMIT, without changing read state", async () => {
    const { db, sqlite } = fixture();
    for (let index = 0; index < 205; index++)
      sqlite
        .prepare("INSERT INTO candidates VALUES (?,?)")
        .run("comment-" + index, "comment");
    sqlite.exec(
      "INSERT INTO candidates VALUES ('mention-abcdefgh','mention');INSERT INTO admin_notification_reads VALUES ('me@example.com','mention-abcdefgh')",
    );
    const now = new Date();
    const until = new Date(now.getTime() + 3600000);
    expect(
      (
        await handleNotificationFeatures(
          request("/api/admin/notifications/snooze", "POST", {
            id: "mention-abcdefgh",
            until: until.toISOString(),
          }),
          db,
          "me@example.com",
        )
      ).status,
    ).toBe(200);
    const preferences = {
      available: true,
      mutedKinds: ["comment"],
      summaryEnabled: true,
    };
    const select = (params: URLSearchParams, at: Date) => {
      const filter = notificationFeatureFilter(
        { id: "s.id", kind: "s.kind" },
        preferences,
        params,
        "me@example.com",
        at.toISOString(),
      );
      return sqlite
        .prepare(
          "SELECT * FROM candidates s WHERE " + filter.sql + "1=1 LIMIT 1",
        )
        .all(...(filter.values as (string | number | null)[]));
    };
    expect(
      select(new URLSearchParams({ importance: "important" }), now),
    ).toHaveLength(0);
    expect(
      select(new URLSearchParams({ snoozedOnly: "true" }), now),
    ).toHaveLength(1);
    expect(
      select(
        new URLSearchParams({ importance: "important" }),
        new Date(until.getTime() + 1),
      ),
    ).toHaveLength(1);
    expect(
      sqlite
        .prepare("SELECT COUNT(*) AS count FROM admin_notification_reads")
        .get()?.count,
    ).toBe(1);
    sqlite.close();
  });
  it("rejects foreign origins and snooze dates outside the allowed window", async () => {
    const { db, sqlite } = fixture();
    expect(
      (
        await handleNotificationFeatures(
          request(
            "/api/admin/notifications/snooze",
            "POST",
            {
              id: "mention-abcdefgh",
              until: new Date(Date.now() + 3600000).toISOString(),
            },
            "https://other.example",
          ),
          db,
          "me@example.com",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleNotificationFeatures(
          request("/api/admin/notifications/snooze", "POST", {
            id: "mention-abcdefgh",
            until: new Date(Date.now() + 31 * 86400000).toISOString(),
          }),
          db,
          "me@example.com",
        )
      ).status,
    ).toBe(400);
    expect(
      sqlite
        .prepare("SELECT COUNT(*) AS count FROM admin_notification_snoozes")
        .get()?.count,
    ).toBe(0);
    sqlite.close();
  });
});
