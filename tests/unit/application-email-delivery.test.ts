import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  dispatchApplicationEmails,
  type ApplicationEmailDeliveryEnv,
} from "../../src/lib/application-email-delivery";

class Statement {
  private values: SQLInputValue[] = [];

  constructor(
    private readonly query: string,
    private readonly db: DatabaseSync,
  ) {}

  bind(...values: unknown[]) {
    this.values = values as SQLInputValue[];
    return this;
  }

  async all<T>() {
    return { results: this.db.prepare(this.query).all(...this.values) as T[] };
  }

  async run() {
    return {
      meta: {
        changes: Number(
          this.db.prepare(this.query).run(...this.values).changes,
        ),
      },
    };
  }
}

const databases: DatabaseSync[] = [];

beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("隔離テストから外部通信は禁止");
    }),
  ),
);

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function environment() {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec(`
    CREATE TABLE atlasez_application_email_deliveries (
      id TEXT PRIMARY KEY,
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      text_body TEXT NOT NULL,
      html_body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      claim_token TEXT,
      claimed_at TEXT,
      first_attempt_at TEXT,
      sent_at TEXT,
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  const env: ApplicationEmailDeliveryEnv = {
    REPORTS: {
      prepare: (query) => new Statement(query, db),
    },
    RESEND_API_KEY: "isolated-placeholder",
    EMAIL_FROM: "sender@atlasez.test",
  };
  return { db, env };
}

function insertDelivery(
  db: DatabaseSync,
  delivery: {
    id: string;
    status: string;
    attemptCount: number;
    claimedAt: string | null;
    claimToken: string | null;
    now: string;
    createdAt?: string;
    firstAttemptAt?: string | null;
  },
) {
  db.prepare(
    `INSERT INTO atlasez_application_email_deliveries
      (id,recipient_email,subject,text_body,html_body,status,attempt_count,
       next_attempt_at,claim_token,claimed_at,first_attempt_at,created_at,updated_at)
     VALUES (?,?,'Test','Text','<p>Test</p>',?,?,?,?,?,?,?,?)`,
  ).run(
    delivery.id,
    `${delivery.id}@atlasez.test`,
    delivery.status,
    delivery.attemptCount,
    delivery.now,
    delivery.claimToken,
    delivery.claimedAt,
    delivery.firstAttemptAt === undefined
      ? delivery.attemptCount > 0
        ? (delivery.createdAt ?? delivery.now)
        : null
      : delivery.firstAttemptAt,
    delivery.createdAt ?? delivery.now,
    delivery.claimedAt ?? delivery.now,
  );
}

it("retries only expired sending claims and keeps the provider idempotency key", async () => {
  const { db, env } = environment();
  const now = new Date("2026-10-12T00:00:00.000Z");
  const timestamp = now.toISOString();
  insertDelivery(db, {
    id: "stale-delivery",
    status: "sending",
    attemptCount: 1,
    claimedAt: new Date(now.getTime() - 16 * 60_000).toISOString(),
    claimToken: "expired-claim",
    now: timestamp,
  });
  insertDelivery(db, {
    id: "fresh-delivery",
    status: "sending",
    attemptCount: 1,
    claimedAt: new Date(now.getTime() - 1 * 60_000).toISOString(),
    claimToken: "active-claim",
    now: timestamp,
    createdAt: new Date(now.getTime() - (24 * 60 * 60_000 + 1)).toISOString(),
  });

  const idempotencyKeys: string[] = [];
  const logger = { info: vi.fn(), error: vi.fn() };
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    idempotencyKeys.push(
      new Headers(init?.headers).get("Idempotency-Key") ?? "",
    );
    return new Response("{}", {
      status: idempotencyKeys.length === 1 ? 503 : 200,
    });
  });

  expect(
    await dispatchApplicationEmails(env, { now, fetcher, logger }),
  ).toMatchObject({ sent: 0, failed: 1, skipped: false });
  const freshAfterFirstRun = db
    .prepare(
      "SELECT status,attempt_count,claim_token,claimed_at FROM atlasez_application_email_deliveries WHERE id=?",
    )
    .get("fresh-delivery");
  expect(freshAfterFirstRun).toMatchObject({
    status: "sending",
    attempt_count: 1,
    claim_token: "active-claim",
    claimed_at: new Date(now.getTime() - 1 * 60_000).toISOString(),
  });
  expect(
    db
      .prepare(
        "SELECT status,attempt_count,last_error FROM atlasez_application_email_deliveries WHERE id=?",
      )
      .get("stale-delivery"),
  ).toMatchObject({
    status: "retry",
    attempt_count: 2,
    last_error: "provider_503",
  });

  expect(
    await dispatchApplicationEmails(env, {
      now: new Date(now.getTime() + 6 * 60_000),
      fetcher,
      logger,
    }),
  ).toMatchObject({ sent: 1, failed: 0, skipped: false });
  expect(idempotencyKeys).toEqual([
    "atlasez-application-stale-delivery",
    "atlasez-application-stale-delivery",
  ]);
  expect(
    db
      .prepare(
        "SELECT status,attempt_count FROM atlasez_application_email_deliveries WHERE id=?",
      )
      .get("stale-delivery"),
  ).toMatchObject({ status: "sent", attempt_count: 3 });
  expect(
    db
      .prepare(
        "SELECT status,attempt_count,claim_token FROM atlasez_application_email_deliveries WHERE id=?",
      )
      .get("fresh-delivery"),
  ).toMatchObject({
    status: "sending",
    attempt_count: 1,
    claim_token: "active-claim",
  });
});

it("marks an expired sending claim failed when the attempt limit is exhausted", async () => {
  const { db, env } = environment();
  const now = new Date("2026-10-12T00:00:00.000Z");
  insertDelivery(db, {
    id: "exhausted-delivery",
    status: "sending",
    attemptCount: 5,
    claimedAt: new Date(now.getTime() - 16 * 60_000).toISOString(),
    claimToken: "expired-claim",
    now: now.toISOString(),
  });
  const fetcher = vi.fn(async () => new Response("unexpected"));
  const logger = { info: vi.fn(), error: vi.fn() };

  expect(
    await dispatchApplicationEmails(env, { now, fetcher, logger }),
  ).toMatchObject({ sent: 0, failed: 1, skipped: false });
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    db
      .prepare(
        "SELECT status,claim_token,claimed_at,last_error FROM atlasez_application_email_deliveries WHERE id=?",
      )
      .get("exhausted-delivery"),
  ).toMatchObject({
    status: "failed",
    claim_token: null,
    claimed_at: null,
    last_error: "claim_expired_max_attempts",
  });
});

it("retries a stale sending claim just inside the provider idempotency window", async () => {
  const { db, env } = environment();
  const now = new Date("2026-10-12T00:00:00.000Z");
  insertDelivery(db, {
    id: "inside-window-delivery",
    status: "sending",
    attemptCount: 1,
    claimedAt: new Date(now.getTime() - 16 * 60_000).toISOString(),
    claimToken: "old-claim",
    now: now.toISOString(),
    createdAt: new Date(now.getTime() - (24 * 60 * 60_000 - 1)).toISOString(),
  });
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
      "atlasez-application-inside-window-delivery",
    );
    return new Response("{}", { status: 200 });
  });
  const logger = { info: vi.fn(), error: vi.fn() };

  expect(
    await dispatchApplicationEmails(env, { now, fetcher, logger }),
  ).toMatchObject({ sent: 1, failed: 0, skipped: false });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(
    db
      .prepare(
        "SELECT status FROM atlasez_application_email_deliveries WHERE id=?",
      )
      .get("inside-window-delivery"),
  ).toMatchObject({ status: "sent" });
});

it("keeps the provider idempotency window anchored to the first attempt, not queue creation", async () => {
  const { db, env } = environment();
  const firstAttemptAt = new Date("2026-10-10T00:00:00.000Z");
  const queuedAt = new Date(firstAttemptAt.getTime() - 3 * 24 * 60 * 60_000);
  insertDelivery(db, {
    id: "long-waiting-delivery",
    status: "pending",
    attemptCount: 0,
    claimedAt: null,
    claimToken: null,
    now: firstAttemptAt.toISOString(),
    createdAt: queuedAt.toISOString(),
  });

  const idempotencyKeys: string[] = [];
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    idempotencyKeys.push(
      new Headers(init?.headers).get("Idempotency-Key") ?? "",
    );
    return new Response("{}", {
      status: idempotencyKeys.length === 1 ? 503 : 200,
    });
  });
  const logger = { info: vi.fn(), error: vi.fn() };

  expect(
    await dispatchApplicationEmails(env, {
      now: firstAttemptAt,
      fetcher,
      logger,
    }),
  ).toMatchObject({ sent: 0, failed: 1, skipped: false });
  expect(
    db
      .prepare(
        "SELECT status,attempt_count,first_attempt_at FROM atlasez_application_email_deliveries WHERE id=?",
      )
      .get("long-waiting-delivery"),
  ).toMatchObject({
    status: "retry",
    attempt_count: 1,
    first_attempt_at: firstAttemptAt.toISOString(),
  });

  expect(
    await dispatchApplicationEmails(env, {
      now: new Date(firstAttemptAt.getTime() + 6 * 60_000),
      fetcher,
      logger,
    }),
  ).toMatchObject({ sent: 1, failed: 0, skipped: false });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(idempotencyKeys).toEqual([
    "atlasez-application-long-waiting-delivery",
    "atlasez-application-long-waiting-delivery",
  ]);
  expect(
    db
      .prepare(
        "SELECT status,attempt_count,first_attempt_at FROM atlasez_application_email_deliveries WHERE id=?",
      )
      .get("long-waiting-delivery"),
  ).toMatchObject({
    status: "sent",
    attempt_count: 2,
    first_attempt_at: firstAttemptAt.toISOString(),
  });
});

it("fails closed for a stale sending claim just outside the provider idempotency window", async () => {
  const { db, env } = environment();
  const now = new Date("2026-10-12T00:00:00.000Z");
  insertDelivery(db, {
    id: "outside-window-delivery",
    status: "sending",
    attemptCount: 1,
    claimedAt: new Date(now.getTime() - 16 * 60_000).toISOString(),
    claimToken: "old-claim",
    now: now.toISOString(),
    createdAt: new Date(now.getTime() - (24 * 60 * 60_000 + 1)).toISOString(),
  });
  const fetcher = vi.fn(async () => new Response("unexpected"));
  const logger = { info: vi.fn(), error: vi.fn() };

  expect(
    await dispatchApplicationEmails(env, { now, fetcher, logger }),
  ).toMatchObject({ sent: 0, failed: 1, skipped: false });
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    db
      .prepare(
        "SELECT status,claim_token,claimed_at,last_error FROM atlasez_application_email_deliveries WHERE id=?",
      )
      .get("outside-window-delivery"),
  ).toMatchObject({
    status: "failed",
    claim_token: null,
    claimed_at: null,
    last_error: "provider_idempotency_window_expired",
  });
  expect(logger.error).toHaveBeenCalledWith(
    expect.stringContaining(
      '"event":"application_email_attempts_past_idempotency_window"',
    ),
  );
});

it("fails a retry just outside the provider idempotency window without sending", async () => {
  const { db, env } = environment();
  const now = new Date("2026-10-12T00:00:00.000Z");
  insertDelivery(db, {
    id: "old-retry-delivery",
    status: "retry",
    attemptCount: 2,
    claimedAt: null,
    claimToken: null,
    now: now.toISOString(),
    createdAt: new Date(now.getTime() - (24 * 60 * 60_000 + 1)).toISOString(),
  });
  const fetcher = vi.fn(async () => new Response("unexpected"));
  const logger = { info: vi.fn(), error: vi.fn() };

  expect(
    await dispatchApplicationEmails(env, { now, fetcher, logger }),
  ).toMatchObject({ sent: 0, failed: 1, skipped: false });
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    db
      .prepare(
        "SELECT status,claim_token,claimed_at,last_error FROM atlasez_application_email_deliveries WHERE id=?",
      )
      .get("old-retry-delivery"),
  ).toMatchObject({
    status: "failed",
    claim_token: null,
    claimed_at: null,
    last_error: "provider_idempotency_window_expired",
  });
  expect(logger.error).toHaveBeenCalledWith(
    expect.stringContaining(
      '"event":"application_email_attempts_past_idempotency_window"',
    ),
  );
});

it("allows a retry just inside the provider idempotency window", async () => {
  const { db, env } = environment();
  const now = new Date("2026-10-12T00:00:00.000Z");
  insertDelivery(db, {
    id: "inside-window-retry",
    status: "retry",
    attemptCount: 1,
    claimedAt: null,
    claimToken: null,
    now: now.toISOString(),
    createdAt: new Date(now.getTime() - (24 * 60 * 60_000 - 1)).toISOString(),
  });
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
      "atlasez-application-inside-window-retry",
    );
    return new Response("{}", { status: 200 });
  });
  const logger = { info: vi.fn(), error: vi.fn() };

  expect(
    await dispatchApplicationEmails(env, { now, fetcher, logger }),
  ).toMatchObject({ sent: 1, failed: 0, skipped: false });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(
    db
      .prepare(
        "SELECT status FROM atlasez_application_email_deliveries WHERE id=?",
      )
      .get("inside-window-retry"),
  ).toMatchObject({ status: "sent" });
});
