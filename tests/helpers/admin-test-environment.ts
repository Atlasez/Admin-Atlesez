import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, vi } from "vitest";
import worker from "../../src/admin-worker";

class Statement {
  values: SQLInputValue[] = [];
  constructor(
    readonly query: string,
    readonly db: DatabaseSync,
  ) {}
  bind(...values: unknown[]) {
    this.values = values as SQLInputValue[];
    return this;
  }
  async first<T>() {
    return (
      (this.db.prepare(this.query).get(...this.values) as T | undefined) ?? null
    );
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
      throw new Error("隔離受入検証から外部通信は禁止");
    }),
  ),
);
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

export function createAdminTestEnvironment() {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  const migrationDirectory = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(migrationDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(new URL(file, migrationDirectory), "utf8"));
  db.exec("PRAGMA foreign_keys=ON");
  const env = {
    ADMIN_AUTH_MODE: "google-oauth",
    ADMIN_PRIMARY_EMAIL: "global@atlasez.test",
    APPLICATION_OPERATIONS_EMAILS: "operator@atlasez.test",
    REPORTS: {
      prepare: (query: string) => new Statement(query, db),
      batch: async (statements: Statement[]) => {
        db.exec("BEGIN");
        try {
          const results = [];
          for (const statement of statements)
            results.push(
              /^\s*SELECT\b/i.test(statement.query)
                ? await statement.all()
                : await statement.run(),
            );
          db.exec("COMMIT");
          return results;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    },
    ASSETS: {
      fetch: async () =>
        new Response("isolated fixture", {
          headers: { "content-type": "text/html" },
        }),
    },
  };
  const session = (email: string) => {
    const token = `isolated-${email}`;
    db.prepare(
      "INSERT OR REPLACE INTO admin_auth_sessions(session_hash,email,expires_at,created_at) VALUES (?,?,?,?)",
    ).run(
      createHash("sha256").update(token).digest("hex"),
      email,
      "2099-01-01T00:00:00.000Z",
      new Date().toISOString(),
    );
    return token;
  };
  const request = (
    path: string,
    email: string,
    body?: unknown,
    origin = "https://admin.atlasez.test",
  ) =>
    worker.fetch(
      new Request(`https://admin.atlasez.test${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          cookie: `atlasez_admin_session=${session(email)}`,
          origin,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env as never,
    );
  return { db, request, env };
}
