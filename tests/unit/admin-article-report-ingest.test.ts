import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import type {
  D1Database,
  D1PreparedStatement,
} from "../../src/lib/admin-database";
import worker from "../../src/admin-worker";

class SqliteStatement implements D1PreparedStatement {
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

it("keeps report IDs idempotent and limits content-hash dedupe to seven days", async () => {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec(`
    CREATE TABLE article_reports (
      id TEXT PRIMARY KEY,
      article_title TEXT NOT NULL,
      article_url TEXT NOT NULL,
      article_id TEXT,
      subject TEXT NOT NULL,
      category TEXT NOT NULL,
      report_type TEXT NOT NULL,
      details TEXT NOT NULL,
      contact TEXT,
      locale TEXT NOT NULL,
      reporter_hash TEXT NOT NULL,
      content_hash TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);
  const database: D1Database = {
    prepare: (query) => new SqliteStatement(query, db),
    batch: async () => [],
  };
  const hash = "a".repeat(64);
  const reporterHash = "b".repeat(64);
  const oldCreatedAt = new Date(Date.now() - 8 * 86_400_000).toISOString();
  db.prepare(
    `INSERT INTO article_reports
      (id, article_title, article_url, subject, category, report_type, details, locale, reporter_hash, content_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "old-report",
    "Example article",
    "https://atlasez.org/atlas/ja/example/",
    "mathematics",
    "overview",
    "error",
    "Synthetic report content",
    "jpn",
    reporterHash,
    hash,
    oldCreatedAt,
  );

  const send = async (reportId: string, contentHash = hash) =>
    worker.fetch(
      new Request("https://admin.atlasez.org/internal/article-reports", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-atlasez-article-report-token": "test-ingest-token",
        },
        body: JSON.stringify({
          reportId,
          articleTitle: "Example article",
          articleUrl: "https://atlasez.org/atlas/ja/example/",
          articleId: "example",
          subject: "mathematics",
          category: "overview",
          reportType: "error",
          details: "Synthetic report content",
          locale: "jpn",
          reporterHash,
          contentHash,
        }),
      }),
      {
        REPORTS: database,
        ARTICLE_REPORT_INGEST_TOKEN: "test-ingest-token",
      } as never,
    );

  const accepted = await send("11111111-1111-4111-8111-111111111111");
  expect(accepted.status).toBe(201);
  expect(
    db.prepare("SELECT COUNT(*) AS count FROM article_reports").get(),
  ).toEqual({ count: 2 });

  const duplicateHash = await send("22222222-2222-4222-8222-222222222222");
  expect(duplicateHash.status).toBe(200);
  await expect(duplicateHash.json()).resolves.toEqual({
    ok: true,
    duplicate: true,
  });

  const duplicateId = await send(
    "11111111-1111-4111-8111-111111111111",
    "c".repeat(64),
  );
  expect(duplicateId.status).toBe(200);
  await expect(duplicateId.json()).resolves.toEqual({
    ok: true,
    duplicate: true,
  });
  expect(
    db.prepare("SELECT COUNT(*) AS count FROM article_reports").get(),
  ).toEqual({ count: 2 });
});
