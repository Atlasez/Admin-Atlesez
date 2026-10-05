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
    this.db.queries.push(this.query);
    if (this.query.includes("SELECT r.id,r.remind_at,r.timezone"))
      return { results: this.db.legacyRows as T[] };
    if (this.query.includes("SELECT r.id AS reminder_id"))
      return {
        results: (this.db.recipientActive ? this.db.dueRows : []) as T[],
      };
    if (this.query.includes("SELECT a.delivery_key")) {
      const results = this.db.recipientActive ? [...this.db.attemptRows] : [];
      if (this.db.flipLifecycleBeforeClaim) {
        this.db.recipientActive = false;
        this.db.flipLifecycleBeforeClaim = false;
      }
      return { results: results as T[] };
    }
    return { results: [] as T[] };
  }
  async run() {
    this.db.queries.push(this.query);
    if (
      this.query.startsWith(
        "UPDATE editorial_task_reminder_delivery_attempts AS a",
      )
    )
      return {
        meta: {
          changes: this.db.recipientActive ? this.db.claimChanges : 0,
        },
      };
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
  legacyRows: Array<{ id: string; remind_at: string; timezone: string }> = [];
  normalizedValues: unknown[][] = [];
  claimChanges = 1;
  recipientActive = true;
  flipLifecycleBeforeClaim = false;
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
    this.normalizedValues.push(
      ...statements.map((statement) => statement.values),
    );
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

  it("normalizes legacy reminders even when email delivery is misconfigured", async () => {
    const db = new FakeDb();
    db.legacyRows = [
      {
        id: "legacy-reminder",
        remind_at: "2026-01-15T09:00",
        timezone: "Asia/Tokyo",
      },
    ];

    await expect(
      dispatchDueTaskReminders(
        { REPORTS: db, RESEND_API_KEY: "re_test_secret" },
        { now, fetcher: async () => new Response(null, { status: 200 }) },
      ),
    ).rejects.toThrow("configuration is incomplete");

    expect(db.normalizedValues).toEqual([
      [
        "2026-01-15T00:00:00.000Z",
        "legacy-reminder",
        "2026-01-15T09:00",
        "Asia/Tokyo",
      ],
      ["legacy-reminder"],
    ]);
  });

  it("records invalid legacy reminders so they cannot starve later valid rows", async () => {
    const db = new FakeDb();
    db.legacyRows = [
      { id: "invalid-time", remind_at: "not-a-date", timezone: "Asia/Tokyo" },
      {
        id: "invalid-zone",
        remind_at: "2026-01-15T09:00",
        timezone: "Mars/Olympus",
      },
    ];
    const logger = { info: () => undefined, error: () => undefined };

    await expect(
      dispatchDueTaskReminders(
        { REPORTS: db },
        {
          now,
          logger,
          fetcher: async () => new Response(null, { status: 200 }),
        },
      ),
    ).rejects.toThrow("configuration is incomplete");

    expect(db.queries[0]).toContain(
      "LEFT JOIN editorial_task_reminder_normalization_issues",
    );
    expect(db.queries[0]).toContain(
      "i.remind_at=r.remind_at AND i.timezone=r.timezone",
    );
    expect(db.normalizedValues).toEqual([
      [
        "invalid-time",
        "not-a-date",
        "Asia/Tokyo",
        "invalid_time",
        now.toISOString(),
      ],
      [
        "invalid-zone",
        "2026-01-15T09:00",
        "Mars/Olympus",
        "invalid_timezone",
        now.toISOString(),
      ],
    ]);
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
    const lifecycleGuardedQueries = db.queries.filter((query) =>
      query.includes("atlasez_project_member_lifecycle"),
    );
    expect(lifecycleGuardedQueries).toHaveLength(4);
    expect(
      lifecycleGuardedQueries.every(
        (query) =>
          query.includes("lifecycle.state IN ('paused','withdrawn')") &&
          query.includes("archived.status='archived'"),
      ),
    ).toBe(true);
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

  it("skips paused recipients for due reminders and existing retries", async () => {
    const db = new FakeDb();
    db.recipientActive = false;
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

  it("rechecks lifecycle state when claiming a reminder after candidates load", async () => {
    const db = new FakeDb();
    db.dueRows.splice(0);
    db.flipLifecycleBeforeClaim = true;
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
