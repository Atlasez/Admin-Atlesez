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

it("gates proposed personal-data cleanup while routine expiry continues", async () => {
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
    applicationRetentionEnabled?: string,
  ) => {
    const pending: Promise<unknown>[] = [];
    await worker.scheduled(
      { cron: "15 3 * * *" },
      {
        REPORTS: database,
        EMAIL_FROM: "Atlasez <noreply@example.test>",
        RESEND_API_KEY: "test-key",
        ADMIN_PERSONAL_DATA_RETENTION_ENABLED: retentionEnabled,
        ADMIN_APPLICATION_RETENTION_ENABLED: applicationRetentionEnabled,
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

  const articleRetentionEnabled = createDatabase();
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    await scheduled(articleRetentionEnabled.database, "true");
    expect(
      articleRetentionEnabled.executed.some((query) =>
        query.includes("DELETE FROM atlasez_member_applications"),
      ),
    ).toBe(false);
    expect(
      articleRetentionEnabled.executed.some((query) =>
        query.includes("article_reports"),
      ),
    ).toBe(true);

    const applicationRetentionEnabledDb = createDatabase();
    await scheduled(applicationRetentionEnabledDb.database, undefined, "true");
    expect(
      applicationRetentionEnabledDb.executed.some((query) =>
        query.includes("DELETE FROM atlasez_member_applications"),
      ),
    ).toBe(true);
    expect(
      applicationRetentionEnabledDb.executed.some((query) =>
        query.includes("article_reports"),
      ),
    ).toBe(false);
  } finally {
    info.mockRestore();
  }
});

it("preserves terminal applications unless personal-data retention is enabled", async () => {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec(`
    CREATE TABLE admin_auth_sessions (expires_at TEXT NOT NULL);
    CREATE TABLE atlasez_application_rate_limits (bucket INTEGER NOT NULL);
    CREATE TABLE atlasez_member_applications (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      intake_reconciliation_required INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE atlasez_application_email_deliveries (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES atlasez_member_applications(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('pending','sending','retry','sent','failed'))
    );
  `);
  const database: D1Database = {
    prepare: (query) => new Statement(query, db),
    batch: async () => [],
  };
  const now = new Date("2026-10-12T00:00:00.000Z");
  const daysAgo = (days: number) =>
    new Date(now.getTime() - days * 86_400_000).toISOString();
  const insert = db.prepare(
    "INSERT INTO atlasez_member_applications (id,status,updated_at) VALUES (?,?,?)",
  );
  insert.run("old-accepted", "accepted", daysAgo(181));
  insert.run("old-rejected", "rejected", daysAgo(181));
  insert.run("boundary-accepted", "accepted", daysAgo(180));
  insert.run("old-reviewing", "reviewing", daysAgo(365));

  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    await expect(
      runPersonalDataRetention(database, now),
    ).resolves.toMatchObject({
      resolvedApplicationsDeleted: 0,
    });
    expect(
      db
        .prepare("SELECT COUNT(*) AS count FROM atlasez_member_applications")
        .get(),
    ).toEqual({ count: 4 });

    await expect(
      runPersonalDataRetention(database, now, {
        deleteTerminalApplications: true,
      }),
    ).resolves.toMatchObject({ resolvedApplicationsDeleted: 2 });
    expect(
      db
        .prepare(
          "SELECT id,status,updated_at FROM atlasez_member_applications ORDER BY status,updated_at",
        )
        .all(),
    ).toEqual([
      { id: "boundary-accepted", status: "accepted", updated_at: daysAgo(180) },
      { id: "old-reviewing", status: "reviewing", updated_at: daysAgo(365) },
    ]);
  } finally {
    info.mockRestore();
  }
});

it("fails closed when the intake reconciliation marker migration is unavailable", async () => {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec(`
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
      status TEXT NOT NULL CHECK(status IN ('pending','sending','retry','sent','failed'))
    );
  `);
  const database: D1Database = {
    prepare: (query) => new Statement(query, db),
    batch: async () => [],
  };
  const now = new Date("2026-10-12T00:00:00.000Z");
  const expiredAt = new Date(now.getTime() - 181 * 86_400_000).toISOString();
  db.prepare(
    "INSERT INTO atlasez_member_applications (id,status,updated_at) VALUES (?,?,?)",
  ).run("legacy-schema", "accepted", expiredAt);

  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(
      runPersonalDataRetention(database, now, {
        deleteTerminalApplications: true,
      }),
    ).resolves.toMatchObject({
      resolvedApplicationsDeleted: 0,
      terminalApplicationsRetentionSkipped: true,
    });
    expect(
      db.prepare("SELECT id FROM atlasez_member_applications").all(),
    ).toEqual([{ id: "legacy-schema" }]);
    expect(error).toHaveBeenCalledWith(
      "application_retention_skipped_marker_probe_failed",
    );
  } finally {
    info.mockRestore();
    error.mockRestore();
  }
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

it("keeps applications with any undelivered email and verifies linked-record cascades", async () => {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE admin_auth_sessions (expires_at TEXT NOT NULL);
    CREATE TABLE atlasez_application_rate_limits (bucket INTEGER NOT NULL);
    CREATE TABLE atlasez_member_applications (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      intake_reconciliation_required INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE atlasez_application_email_deliveries (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES atlasez_member_applications(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('pending','sending','retry','sent','failed'))
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
    CREATE TABLE admin_audit_log (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL
    );
    CREATE TABLE editorial_member_intake_tracking (
      project_id TEXT NOT NULL,
      email TEXT NOT NULL,
      application_id TEXT,
      PRIMARY KEY(project_id,email)
    );
  `);
  const database: D1Database = {
    prepare: (query) => new Statement(query, db),
    batch: async () => [],
  };
  const now = new Date("2026-10-12T00:00:00.000Z");
  const expiredAt = new Date(now.getTime() - 181 * 86_400_000).toISOString();
  const queueStates = ["failed", "pending", "retry", "sending"] as const;
  for (const status of [...queueStates, "sent"] as const) {
    const id = `application-${status}`;
    db.prepare(
      "INSERT INTO atlasez_member_applications (id,status,updated_at) VALUES (?,?,?)",
    ).run(id, status === "pending" ? "accepted" : "rejected", expiredAt);
    db.prepare(
      "INSERT INTO atlasez_application_email_deliveries (id,application_id,status) VALUES (?,?,?)",
    ).run(`delivery-${status}`, id, status);
    db.prepare(
      "INSERT INTO atlasez_application_interviews (id,application_id) VALUES (?,?)",
    ).run(`interview-${status}`, id);
    db.prepare(
      "INSERT INTO atlasez_application_interview_reviews (id,application_id) VALUES (?,?)",
    ).run(`review-${status}`, id);
    db.prepare(
      "INSERT INTO atlasez_application_interview_history (id,application_id) VALUES (?,?)",
    ).run(`history-${status}`, id);
    // The general audit log is deliberately not FK-cascaded from applications.
    db.prepare(
      "INSERT INTO admin_audit_log (id,target_type,target_id) VALUES (?,?,?)",
    ).run(`audit-${status}`, "application", id);
    // Intake tracking keeps a textual application reference without an FK.
    db.prepare(
      "INSERT INTO editorial_member_intake_tracking (project_id,email,application_id) VALUES (?,?,?)",
    ).run(`project-${status}`, `${status}@example.test`, id);
  }

  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    await expect(
      runPersonalDataRetention(database, now, {
        deleteTerminalApplications: true,
      }),
    ).resolves.toMatchObject({
      resolvedApplicationsDeleted: 1,
      terminalApplicationsWithUndeliveredEmail: 4,
    });

    expect(
      db
        .prepare("SELECT id FROM atlasez_member_applications ORDER BY id")
        .all(),
    ).toEqual(
      expect.arrayContaining(
        queueStates.map((status) => ({ id: `application-${status}` })),
      ),
    );
    expect(
      db
        .prepare(
          "SELECT application_id,status FROM atlasez_application_email_deliveries ORDER BY application_id",
        )
        .all(),
    ).toEqual(
      queueStates.map((status) => ({
        application_id: `application-${status}`,
        status,
      })),
    );
    expect(
      db
        .prepare("SELECT COUNT(*) AS count FROM atlasez_application_interviews")
        .get(),
    ).toEqual({ count: 4 });
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM atlasez_application_interview_reviews",
        )
        .get(),
    ).toEqual({ count: 4 });
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM atlasez_application_interview_history",
        )
        .get(),
    ).toEqual({ count: 4 });
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM admin_audit_log").get(),
    ).toEqual({ count: 5 });
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM editorial_member_intake_tracking",
        )
        .get(),
    ).toEqual({ count: 5 });

    // Re-running retention is safe: no protected application or queue is lost.
    await expect(
      runPersonalDataRetention(database, now, {
        deleteTerminalApplications: true,
      }),
    ).resolves.toMatchObject({
      resolvedApplicationsDeleted: 0,
      terminalApplicationsWithUndeliveredEmail: 4,
    });
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries",
        )
        .get(),
    ).toEqual({ count: 4 });
  } finally {
    info.mockRestore();
  }
});

it("keeps terminal applications while intake reconciliation remains unresolved", async () => {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec(`
    CREATE TABLE admin_auth_sessions (expires_at TEXT NOT NULL);
    CREATE TABLE atlasez_application_rate_limits (bucket INTEGER NOT NULL);
    CREATE TABLE atlasez_member_applications (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      intake_reconciliation_required INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE atlasez_application_email_deliveries (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES atlasez_member_applications(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('pending','sending','retry','sent','failed'))
    );
  `);
  const database: D1Database = {
    prepare: (query) => new Statement(query, db),
    batch: async () => [],
  };
  const now = new Date("2026-10-12T00:00:00.000Z");
  const expiredAt = new Date(now.getTime() - 181 * 86_400_000).toISOString();
  db.prepare(
    "INSERT INTO atlasez_member_applications (id,status,updated_at,intake_reconciliation_required) VALUES (?,?,?,?)",
  ).run("unresolved", "accepted", expiredAt, 1);
  db.prepare(
    "INSERT INTO atlasez_member_applications (id,status,updated_at,intake_reconciliation_required) VALUES (?,?,?,?)",
  ).run("reconciled", "rejected", expiredAt, 0);

  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    await expect(
      runPersonalDataRetention(database, now, {
        deleteTerminalApplications: true,
      }),
    ).resolves.toMatchObject({ resolvedApplicationsDeleted: 1 });
    expect(
      db
        .prepare(
          "SELECT id,intake_reconciliation_required FROM atlasez_member_applications",
        )
        .all(),
    ).toEqual([{ id: "unresolved", intake_reconciliation_required: 1 }]);
  } finally {
    info.mockRestore();
  }
});

it("rechecks the intake marker in the delete predicate after the candidate count", async () => {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec(`
    CREATE TABLE admin_auth_sessions (expires_at TEXT NOT NULL);
    CREATE TABLE atlasez_application_rate_limits (bucket INTEGER NOT NULL);
    CREATE TABLE atlasez_member_applications (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      intake_reconciliation_required INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE atlasez_application_email_deliveries (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES atlasez_member_applications(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('pending','sending','retry','sent','failed'))
    );
  `);
  const now = new Date("2026-10-12T00:00:00.000Z");
  const expiredAt = new Date(now.getTime() - 181 * 86_400_000).toISOString();
  db.prepare(
    "INSERT INTO atlasez_member_applications (id,status,updated_at,intake_reconciliation_required) VALUES (?,?,?,0)",
  ).run("turns-unresolved", "accepted", expiredAt);
  const database: D1Database = {
    prepare: (query) => {
      const statement = new Statement(query, db);
      const wrapped: D1PreparedStatement = {
        bind(...values: unknown[]) {
          statement.bind(...values);
          return wrapped;
        },
        run: () => statement.run(),
        all: <T>() => statement.all<T>(),
        first: async <T>() => {
          const result = await statement.first<T>();
          if (
            query.includes("COUNT(*) AS count") &&
            query.includes("intake_reconciliation_required=0")
          ) {
            db.prepare(
              "UPDATE atlasez_member_applications SET intake_reconciliation_required=1 WHERE id=?",
            ).run("turns-unresolved");
          }
          return result;
        },
      };
      return wrapped;
    },
    batch: async () => [],
  };

  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    await expect(
      runPersonalDataRetention(database, now, {
        deleteTerminalApplications: true,
      }),
    ).resolves.toMatchObject({ resolvedApplicationsDeleted: 0 });
    expect(
      db
        .prepare(
          "SELECT id,intake_reconciliation_required FROM atlasez_member_applications",
        )
        .all(),
    ).toEqual([{ id: "turns-unresolved", intake_reconciliation_required: 1 }]);
  } finally {
    info.mockRestore();
  }
});
