import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import type {
  D1Database,
  D1PreparedStatement,
} from "../../src/lib/admin-database";
import { runPersonalDataRetention } from "../../src/admin-worker";

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
  await expect(runPersonalDataRetention(database, now)).resolves.toMatchObject({
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
