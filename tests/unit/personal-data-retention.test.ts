import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import type {
  D1Database,
  D1PreparedStatement,
} from "../../src/lib/admin-database";
import worker, { runPersonalDataRetention } from "../../src/admin-worker";

class Statement implements D1PreparedStatement {
  private values: SQLInputValue[] = [];

  constructor(
    private readonly query: string,
    private readonly db: DatabaseSync,
  ) {}

  bind(...values: unknown[]) {
    this.values = values as SQLInputValue[];
    return this;
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

  async all<T>() {
    return { results: this.db.prepare(this.query).all(...this.values) as T[] };
  }

  async first<T>() {
    return (
      (this.db.prepare(this.query).get(...this.values) as T | undefined) ?? null
    );
  }
}

const databases: DatabaseSync[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

it("keeps proposed article-report cleanup opt-in and pauses application deletion", async () => {
  const createDatabase = () => {
    const executed: string[] = [];
    const database = {
      prepare: (query: string) => ({
        bind: (..._values: unknown[]) => ({
          all: async <T>() => ({ results: [] as T[] }),
          first: async <T>() => null as T | null,
          run: async () => {
            executed.push(query);
            return { meta: { changes: 0 } };
          },
        }),
        all: async <T>() => ({ results: [] as T[] }),
        first: async <T>() => null as T | null,
        run: async () => {
          executed.push(query);
          return { meta: { changes: 0 } };
        },
      }),
      batch: async (statements: Array<{ run(): Promise<unknown> }>) => {
        await Promise.all(statements.map((statement) => statement.run()));
        return [];
      },
    };
    return { database, executed };
  };
  const scheduled = async (
    database: ReturnType<typeof createDatabase>["database"],
    retentionEnabled?: string,
  ) => {
    const pending: Promise<unknown>[] = [];
    await worker.scheduled(
      { cron: "15 3 * * *" },
      {
        REPORTS: database,
        EMAIL_FROM: "Atlasez <noreply@example.test>",
        RESEND_API_KEY: "test-key",
        ADMIN_PERSONAL_DATA_RETENTION_ENABLED: retentionEnabled,
        ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
      } as never,
      { waitUntil: (promise) => pending.push(promise) },
    );
    await Promise.all(pending);
  };

  const disabled = createDatabase();
  await scheduled(disabled.database);
  expect(
    disabled.executed.some((query) =>
      /DELETE FROM admin_auth_sessions|DELETE FROM atlasez_application_rate_limits/.test(
        query,
      ),
    ),
  ).toBe(true);
  expect(
    disabled.executed.some((query) =>
      query.includes("DELETE FROM atlasez_member_applications"),
    ),
  ).toBe(false);
  expect(
    disabled.executed.some((query) => query.includes("article_reports")),
  ).toBe(false);

  const enabled = createDatabase();
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    await scheduled(enabled.database, "true");
    expect(
      enabled.executed.some((query) =>
        query.includes("DELETE FROM atlasez_member_applications"),
      ),
    ).toBe(false);
    expect(
      enabled.executed.some((query) => query.includes("article_reports")),
    ).toBe(true);
  } finally {
    info.mockRestore();
  }
});

it("retains accepted/rejected applications and cascading notification/review history while OPSD-03 is pending", async () => {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE admin_auth_sessions (expires_at TEXT NOT NULL);
    CREATE TABLE atlasez_application_rate_limits (bucket INTEGER NOT NULL);
    CREATE TABLE atlasez_member_applications (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE atlasez_application_email_deliveries (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES atlasez_member_applications(id) ON DELETE CASCADE,
      status TEXT NOT NULL
    );
    CREATE TABLE atlasez_application_interviews (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL UNIQUE REFERENCES atlasez_member_applications(id) ON DELETE CASCADE
    );
    CREATE TABLE atlasez_application_interview_reviews (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL UNIQUE REFERENCES atlasez_member_applications(id) ON DELETE CASCADE
    );
    CREATE TABLE atlasez_application_interview_history (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES atlasez_member_applications(id) ON DELETE CASCADE
    );
  `);
  const database: D1Database = {
    prepare: (query) => new Statement(query, db),
    batch: async () => [],
  };
  const now = new Date("2026-11-06T00:00:00.000Z");
  const expired = new Date(now.getTime() - 181 * 86_400_000).toISOString();
  const expiredSession = new Date(now.getTime() - 2 * 86_400_000).toISOString();
  const activeSession = new Date(now.getTime() + 2 * 86_400_000).toISOString();
  db.prepare("INSERT INTO admin_auth_sessions(expires_at) VALUES (?)").run(
    expiredSession,
  );
  db.prepare("INSERT INTO admin_auth_sessions(expires_at) VALUES (?)").run(
    activeSession,
  );
  const expiredRateLimitBucket = Math.floor(
    (now.getTime() - 2 * 86_400_000) / 600_000,
  );
  const activeRateLimitBucket = Math.floor(
    (now.getTime() - 12 * 60 * 60 * 1_000) / 600_000,
  );
  db.prepare(
    "INSERT INTO atlasez_application_rate_limits(bucket) VALUES (?)",
  ).run(expiredRateLimitBucket);
  db.prepare(
    "INSERT INTO atlasez_application_rate_limits(bucket) VALUES (?)",
  ).run(activeRateLimitBucket);
  db.prepare(
    "INSERT INTO atlasez_member_applications(id,status,updated_at) VALUES (?,?,?)",
  ).run("accepted-old", "accepted", expired);
  db.prepare(
    "INSERT INTO atlasez_member_applications(id,status,updated_at) VALUES (?,?,?)",
  ).run("rejected-old", "rejected", expired);
  db.prepare(
    "INSERT INTO atlasez_application_email_deliveries(id,application_id,status) VALUES (?,?,?)",
  ).run("pending-email", "accepted-old", "pending");
  db.prepare(
    "INSERT INTO atlasez_application_email_deliveries(id,application_id,status) VALUES (?,?,?)",
  ).run("retry-email", "rejected-old", "retry");
  db.prepare(
    "INSERT INTO atlasez_application_interviews(id,application_id) VALUES (?,?)",
  ).run("interview", "accepted-old");
  db.prepare(
    "INSERT INTO atlasez_application_interview_reviews(id,application_id) VALUES (?,?)",
  ).run("review", "accepted-old");
  db.prepare(
    "INSERT INTO atlasez_application_interview_history(id,application_id) VALUES (?,?)",
  ).run("history", "accepted-old");

  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    await expect(
      runPersonalDataRetention(database, now),
    ).resolves.toMatchObject({
      sessionsDeleted: 1,
      rateLimitsDeleted: 1,
      applicationDeletionPaused: true,
      resolvedApplicationsDeleted: 0,
    });
    expect(info).toHaveBeenCalledWith(
      "personal_data_retention_completed",
      expect.objectContaining({
        sessionsDeleted: 1,
        rateLimitsDeleted: 1,
        applicationDeletionPaused: true,
        resolvedApplicationsDeleted: 0,
      }),
    );
  } finally {
    info.mockRestore();
  }
  expect(
    db.prepare("SELECT COUNT(*) AS count FROM admin_auth_sessions").get(),
  ).toEqual({
    count: 1,
  });
  expect(
    db
      .prepare("SELECT COUNT(*) AS count FROM atlasez_application_rate_limits")
      .get(),
  ).toEqual({ count: 1 });
  for (const table of [
    "atlasez_member_applications",
    "atlasez_application_email_deliveries",
    "atlasez_application_interviews",
    "atlasez_application_interview_reviews",
    "atlasez_application_interview_history",
  ]) {
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({
      count:
        table === "atlasez_member_applications"
          ? 2
          : table === "atlasez_application_email_deliveries"
            ? 2
            : 1,
    });
  }
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("clears expired article-report fingerprints and resolved contacts without deleting reports", async () => {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec(`
    CREATE TABLE admin_auth_sessions (expires_at TEXT NOT NULL);
    CREATE TABLE atlasez_application_rate_limits (bucket INTEGER NOT NULL);
    CREATE TABLE atlasez_member_applications (status TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE article_reports (
      id TEXT PRIMARY KEY,
      details TEXT NOT NULL,
      status TEXT NOT NULL,
      reporter_hash TEXT NOT NULL,
      content_hash TEXT NOT NULL DEFAULT '',
      contact TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const database: D1Database = {
    prepare: (query) => new Statement(query, db),
    batch: async () => [],
  };
  const now = new Date("2026-10-12T00:00:00.000Z");
  const olderThan = (days: number) =>
    new Date(now.getTime() - days * 86_400_000).toISOString();
  const insert = db.prepare(
    "INSERT INTO article_reports (id,details,status,reporter_hash,content_hash,contact,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
  );
  insert.run(
    "old-resolved",
    "retain report details",
    "resolved",
    "old-hash",
    "old-content-hash",
    "old@example.test",
    olderThan(181),
    olderThan(181),
  );
  insert.run(
    "recent-resolved",
    "retain recent report",
    "resolved",
    "recent-hash",
    "recent-content-hash",
    "recent@example.test",
    olderThan(6),
    olderThan(179),
  );
  insert.run(
    "old-open",
    "retain unresolved contact",
    "new",
    "open-hash",
    "open-content-hash",
    "open@example.test",
    olderThan(31),
    olderThan(181),
  );
  insert.run(
    "content-hash-boundary",
    "retain hash at seven-day boundary",
    "new",
    "current-reporter-hash",
    "boundary-content-hash",
    null,
    olderThan(7),
    now.toISOString(),
  );
  insert.run(
    "reporter-hash-boundary",
    "retain reporter hash at thirty-day boundary",
    "new",
    "boundary-reporter-hash",
    "",
    null,
    olderThan(30),
    now.toISOString(),
  );
  insert.run(
    "resolved-contact-boundary",
    "retain contact at one-hundred-eighty-day boundary",
    "resolved",
    "current-reporter-hash",
    "",
    "boundary@example.test",
    olderThan(1),
    olderThan(180),
  );

  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  await expect(
    runPersonalDataRetention(database, now, { clearArticleReportData: true }),
  ).resolves.toMatchObject({
    reporterHashesCleared: 2,
    reportContentHashesCleared: 2,
    resolvedReportContactsCleared: 1,
  });
  expect(info).toHaveBeenCalledWith(
    "personal_data_retention_completed",
    expect.objectContaining({
      reporterHashesCleared: 2,
      reportContentHashesCleared: 2,
      resolvedReportContactsCleared: 1,
    }),
  );
  info.mockRestore();
  expect(
    db
      .prepare(
        "SELECT id,details,status,reporter_hash,content_hash,contact FROM article_reports ORDER BY id",
      )
      .all(),
  ).toEqual([
    {
      id: "content-hash-boundary",
      details: "retain hash at seven-day boundary",
      status: "new",
      reporter_hash: "current-reporter-hash",
      content_hash: "boundary-content-hash",
      contact: null,
    },
    {
      id: "old-open",
      details: "retain unresolved contact",
      status: "new",
      reporter_hash: "",
      content_hash: "",
      contact: "open@example.test",
    },
    {
      id: "old-resolved",
      details: "retain report details",
      status: "resolved",
      reporter_hash: "",
      content_hash: "",
      contact: null,
    },
    {
      id: "recent-resolved",
      details: "retain recent report",
      status: "resolved",
      reporter_hash: "recent-hash",
      content_hash: "recent-content-hash",
      contact: "recent@example.test",
    },
    {
      id: "reporter-hash-boundary",
      details: "retain reporter hash at thirty-day boundary",
      status: "new",
      reporter_hash: "boundary-reporter-hash",
      content_hash: "",
      contact: null,
    },
    {
      id: "resolved-contact-boundary",
      details: "retain contact at one-hundred-eighty-day boundary",
      status: "resolved",
      reporter_hash: "current-reporter-hash",
      content_hash: "",
      contact: "boundary@example.test",
    },
  ]);
});

it("logs a safe failure marker and propagates retention errors", async () => {
  const error = new Error("synthetic database failure");
  const failure = vi.spyOn(console, "error").mockImplementation(() => {});
  const database: D1Database = {
    prepare: () => {
      throw error;
    },
    batch: async () => [],
  };

  await expect(runPersonalDataRetention(database)).rejects.toBe(error);
  expect(failure).toHaveBeenCalledWith("personal_data_retention_failed");
  expect(failure.mock.calls.flat().join(" ")).not.toContain(
    "synthetic database failure",
  );
  failure.mockRestore();
});
