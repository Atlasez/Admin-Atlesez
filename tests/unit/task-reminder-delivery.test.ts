import { describe, expect, it } from "vitest";
import {
  dispatchDueTaskReminders,
  type TaskReminderDeliveryEnv,
} from "../../src/lib/task-reminder-delivery";

const now = new Date("2026-01-15T00:00:00.000Z");

class FakeStatement {
  values: unknown[] = [];
  constructor(
    readonly query: string,
    private readonly db: FakeDb,
  ) {}
  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }
  async all<T>() {
    if (this.query.includes("WHERE remind_at_utc IS NULL"))
      return { results: [] as T[] };
    if (this.query.includes("SELECT r.id AS reminder_id"))
      return { results: this.db.dueRows as T[] };
    if (this.query.includes("SELECT a.delivery_key"))
      return { results: this.db.attemptRows as T[] };
    return { results: [] as T[] };
  }
  async run() {
    this.db.queries.push(this.query);
    if (
      this.query.startsWith(
        "UPDATE editorial_task_reminder_delivery_attempts AS a",
      )
    )
      return { meta: { changes: this.db.claimChanges } };
    if (
      this.query.startsWith(
        "INSERT OR IGNORE INTO editorial_task_reminder_delivery_attempts",
      )
    )
      return { meta: { changes: 1 } };
    return { meta: { changes: 1 } };
  }
}

class FakeDb {
  queries: string[] = [];
  claimChanges = 1;
  readonly dueRows = [
    {
      reminder_id: "reminder-1",
      title: "確認する記事",
      details: "本文",
      due_at: "2026-01-15T10:00",
      due_timezone: "Asia/Tokyo",
      remind_at: "2026-01-15T09:00",
      timezone: "Asia/Tokyo",
      remind_at_utc: "2026-01-15T00:00:00.000Z",
      label: "設定した日時",
      repeat: "none",
      recipient_email: "member@example.com",
    },
  ];
  readonly attemptRows = [
    {
      delivery_key: "v1:delivery",
      reminder_id: "reminder-1",
      recipient_email: "member@example.com",
      occurrence_at: "2026-01-15T00:00:00.000Z",
      occurrence_timezone: "Asia/Tokyo",
      payload_json: JSON.stringify({
        from: "Atlasez <noreply@example.com>",
        to: ["member@example.com"],
        subject: "ToDoリマインダー：確認する記事",
        text: "本文",
        html: "<p>本文</p>",
      }),
      provider_idempotency_key: "atlasez-reminder-stable",
      attempt_count: 0,
      retry_deadline_at: "2026-01-15T23:00:00.000Z",
      remind_at: "2026-01-15T09:00",
      timezone: "Asia/Tokyo",
      repeat: "none",
    },
  ];
  prepare(query: string) {
    return new FakeStatement(query, this);
  }
  async batch<T = unknown>(statements: FakeStatement[]) {
    this.queries.push(...statements.map((statement) => statement["query"]));
    return statements.map(() => ({ meta: { changes: 1 } })) as T[];
  }
}

const env = (db: FakeDb): TaskReminderDeliveryEnv => ({
  REPORTS: db,
  RESEND_API_KEY: "re_test_secret",
  EMAIL_FROM: "Atlasez <noreply@example.com>",
});

describe("task reminder delivery", () => {
  it("fails clearly when provider configuration is incomplete", async () => {
    const db = new FakeDb();
    const fetcher = async () => new Response(null, { status: 200 });
    await expect(
      dispatchDueTaskReminders(
        { REPORTS: db, RESEND_API_KEY: "re_test_secret" },
        { now, fetcher },
      ),
    ).rejects.toThrow("configuration is incomplete");
  });

  it("sends a due reminder with a stable idempotency key and safe logs", async () => {
    const db = new FakeDb();
    const requests: RequestInit[] = [];
    const logs: string[] = [];
    const result = await dispatchDueTaskReminders(env(db), {
      now,
      logger: {
        info: (value) => logs.push(value),
        error: (value) => logs.push(value),
      },
      fetcher: async (_input, init) => {
        requests.push(init ?? {});
        return new Response(JSON.stringify({ id: "provider-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(requests).toHaveLength(1);
    expect(new Headers(requests[0].headers).get("Idempotency-Key")).toBe(
      "atlasez-reminder-stable",
    );
    expect(logs.join(" ")).not.toContain("re_test_secret");
    expect(logs.join(" ")).not.toContain("member@example.com");
  });

  it("does not mark a provider failure as sent and leaves a retryable state", async () => {
    const db = new FakeDb();
    const result = await dispatchDueTaskReminders(env(db), {
      now,
      fetcher: async () => new Response("temporary", { status: 503 }),
    });
    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(
      db.queries.some((query) => query.includes("status=?,next_attempt_at=?")),
    ).toBe(true);
    expect(db.queries.some((query) => query.includes("status='sent'"))).toBe(
      false,
    );
  });

  it("does not send when no reminder is due", async () => {
    const db = new FakeDb();
    db.dueRows.splice(0);
    db.attemptRows.splice(0);
    let calls = 0;
    const result = await dispatchDueTaskReminders(env(db), {
      now,
      fetcher: async () => {
        calls += 1;
        return new Response(null, { status: 200 });
      },
    });
    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(calls).toBe(0);
  });

  it("honors an atomic claim result and skips a competing worker", async () => {
    const db = new FakeDb();
    db.claimChanges = 0;
    let calls = 0;
    const result = await dispatchDueTaskReminders(env(db), {
      now,
      fetcher: async () => {
        calls += 1;
        return new Response(null, { status: 200 });
      },
    });
    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(calls).toBe(0);
  });
});
