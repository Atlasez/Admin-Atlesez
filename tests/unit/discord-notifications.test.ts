import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/admin-worker";
import {
  deliverProgressDiscordNotification,
  dispatchDueDiscordNotifications,
  type DiscordNotificationEnv,
} from "../../src/lib/discord-notifications";

const migrationSql = (name: string) =>
  readFileSync(new URL(`../../migrations/${name}`, import.meta.url), "utf8");

const schemaNames = (db: DatabaseSync) =>
  db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => String((row as { name: string }).name));

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
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const openDatabase = (sqlFiles: string[]) => {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  for (const file of sqlFiles) db.exec(migrationSql(file));
  return db;
};

const notificationEnv = (
  db: DatabaseSync,
  overrides: Partial<DiscordNotificationEnv> = {},
): DiscordNotificationEnv => ({
  REPORTS: {
    prepare: (query: string) => new Statement(query, db),
  },
  ...overrides,
});

const silentLogger = { info: () => undefined, error: () => undefined };
const atlasWebhook = "https://discord.com/api/webhooks/111/atlas-secret";
const progressWebhook =
  "https://discordapp.com/api/webhooks/222/progress-secret";
const progressBody = "秘密の進捗本文TOKEN";

const notificationRow = (db: DatabaseSync, dedupeKey: string) =>
  db
    .prepare(
      "SELECT destination_ref,content,status,attempt_count,last_error,sent_at FROM discord_notifications WHERE dedupe_key=?",
    )
    .get(dedupeKey) as {
    destination_ref: string;
    content: string;
    status: string;
    attempt_count: number;
    last_error: string;
    sent_at: string | null;
  };

describe("discord notification migration", () => {
  it("adds only the notification queue and leaves existing rows unchanged", () => {
    const directory = new URL("../../migrations/", import.meta.url);
    const earlier = readdirSync(directory)
      .filter((name) => name.endsWith(".sql") && name < "0133")
      .sort();
    const db = openDatabase(earlier);
    db.prepare(
      "INSERT INTO editorial_progress_reports (id,email,subject,document_id,body,created_at,project_id) VALUES (?,?,?,?,?,?,?)",
    ).run(
      "report-existing",
      "editor@atlasez.test",
      "mathematics",
      null,
      "既存の進捗",
      "2026-10-01T00:00:00.000Z",
      "atlas",
    );
    const beforeRows = db
      .prepare(
        "SELECT id,email,body,project_id FROM editorial_progress_reports",
      )
      .all();
    const beforeSchema = schemaNames(db);
    const sql = migrationSql("0133_discord_notifications.sql");

    expect(sql).not.toMatch(/\b(ALTER|DROP|UPDATE|DELETE|REPLACE)\b/i);
    db.exec(sql);
    db.exec(sql);

    const afterSchema = schemaNames(db);
    expect(
      afterSchema.filter((name) => !name.includes("discord_notifications")),
    ).toEqual(beforeSchema);
    expect(afterSchema).toEqual(
      expect.arrayContaining([
        "discord_notifications",
        "idx_discord_notifications_ready",
      ]),
    );
    expect(
      db
        .prepare(
          "SELECT id,email,body,project_id FROM editorial_progress_reports",
        )
        .all(),
    ).toEqual(beforeRows);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});

describe("discord notification delivery", () => {
  const dbWithQueue = () => openDatabase(["0133_discord_notifications.sql"]);

  it("reports a real send and does not store the webhook URL", async () => {
    const db = dbWithQueue();
    const calls: Array<{
      url: string;
      body: string;
      headers: HeadersInit | undefined;
    }> = [];
    const logs: string[] = [];
    const summary = await deliverProgressDiscordNotification(
      notificationEnv(db, {
        DISCORD_ATLAS_WEBHOOK_URL: atlasWebhook,
        DISCORD_PROGRESS_WEBHOOK_URL: progressWebhook,
      }),
      { reportId: "report-1", subject: "mathematics", body: progressBody },
      {
        now: new Date("2026-10-13T00:00:00.000Z"),
        logger: {
          info: (message) => logs.push(String(message)),
          error: (message) => logs.push(String(message)),
        },
        fetcher: async (url, init) => {
          calls.push({
            url,
            body: String(init?.body ?? ""),
            headers: init?.headers,
          });
          return new Response(null, {
            status: url.includes("atlas-secret") ? 500 : 204,
          });
        },
      },
    );

    expect(summary).toMatchObject({ notified: true, sent: 1, failed: 1 });
    expect(calls.map((call) => call.url).sort()).toEqual(
      [atlasWebhook, progressWebhook].sort(),
    );
    expect(calls.every((call) => call.body.includes(progressBody))).toBe(true);
    expect(calls.every((call) => call.body.includes('"parse":[]'))).toBe(true);
    expect(JSON.stringify(calls)).not.toContain("authorization");
    const sent = notificationRow(
      db,
      "progress:report-1:webhook:DISCORD_PROGRESS_WEBHOOK_URL",
    );
    const failed = notificationRow(
      db,
      "progress:report-1:webhook:DISCORD_ATLAS_WEBHOOK_URL",
    );
    expect(sent).toMatchObject({
      destination_ref: "DISCORD_PROGRESS_WEBHOOK_URL",
      status: "sent",
      attempt_count: 1,
      last_error: "",
    });
    expect(failed).toMatchObject({
      destination_ref: "DISCORD_ATLAS_WEBHOOK_URL",
      status: "retry",
      last_error: "http_500",
    });
    expect(JSON.stringify([sent, failed, logs])).not.toContain(atlasWebhook);
    expect(JSON.stringify([sent, failed, logs])).not.toContain("atlas-secret");
    expect(logs.join("\n")).not.toContain(progressBody);
  });

  it("dedupes a second delivery of the same progress report", async () => {
    const db = dbWithQueue();
    let fetches = 0;
    const env = notificationEnv(db, {
      DISCORD_ATLAS_WEBHOOK_URL: atlasWebhook,
    });
    const input = {
      reportId: "report-dedupe",
      subject: null,
      body: progressBody,
    };
    const fetcher = async () => {
      fetches += 1;
      return new Response(null, { status: 204 });
    };
    const first = await deliverProgressDiscordNotification(env, input, {
      fetcher,
      logger: silentLogger,
    });
    const second = await deliverProgressDiscordNotification(
      env,
      { ...input, body: "別の本文には更新しない" },
      { fetcher, logger: silentLogger },
    );

    expect(first.notified).toBe(true);
    expect(second.notified).toBe(true);
    expect(fetches).toBe(1);
    expect(
      notificationRow(
        db,
        "progress:report-dedupe:webhook:DISCORD_ATLAS_WEBHOOK_URL",
      ).content,
    ).toContain(progressBody);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM discord_notifications").get(),
    ).toEqual({ count: 1 });
  });

  it("sends once when the same notification is claimed concurrently", async () => {
    const db = dbWithQueue();
    let fetches = 0;
    const env = notificationEnv(db, {
      DISCORD_ATLAS_WEBHOOK_URL: atlasWebhook,
    });
    const input = {
      reportId: "report-race",
      subject: null,
      body: progressBody,
    };
    const [first, second] = await Promise.all([
      deliverProgressDiscordNotification(env, input, {
        logger: silentLogger,
        fetcher: async () => {
          fetches += 1;
          return new Response(null, { status: 204 });
        },
      }),
      deliverProgressDiscordNotification(env, input, {
        logger: silentLogger,
        fetcher: async () => {
          fetches += 1;
          return new Response(null, { status: 204 });
        },
      }),
    ]);

    expect(fetches).toBe(1);
    expect(first.notified || second.notified).toBe(true);
  });

  it("does not call Discord for an invalid webhook and retries a timeout from the five-minute queue", async () => {
    const db = dbWithQueue();
    const calls: string[] = [];
    const env = notificationEnv(db, {
      DISCORD_ATLAS_WEBHOOK_URL: "https://example.invalid/hook",
      DISCORD_PROGRESS_WEBHOOK_URL: progressWebhook,
      DISCORD_BOT_TOKEN: "bot-secret-token",
      DISCORD_PROGRESS_CHANNEL_ID: "123456789012345678",
    });
    const summary = await deliverProgressDiscordNotification(
      env,
      {
        reportId: "report-retry",
        subject: null,
        body: progressBody,
        subjectChannelId: "223456789012345678",
      },
      {
        now: new Date("2026-10-13T00:00:00.000Z"),
        logger: silentLogger,
        timeoutMs: 20,
        fetcher: async (url, init) => {
          calls.push(url);
          if (String(url).includes("/channels/123456789012345678/")) {
            expect(new Headers(init?.headers).get("authorization")).toBe(
              "Bot bot-secret-token",
            );
            const signal = init?.signal;
            if (signal?.aborted)
              throw new DOMException("Aborted", "AbortError");
            return new Promise((_resolve, reject) => {
              signal?.addEventListener("abort", () =>
                reject(new DOMException("Aborted", "AbortError")),
              );
            });
          }
          return new Response(JSON.stringify({ retry_after: 600 }), {
            status: 429,
          });
        },
      },
    );

    expect(summary.notified).toBe(false);
    expect(calls.some((url) => url.includes("example.invalid"))).toBe(false);
    expect(
      notificationRow(
        db,
        "progress:report-retry:webhook:DISCORD_ATLAS_WEBHOOK_URL",
      ),
    ).toMatchObject({ status: "failed", last_error: "invalid_destination" });
    expect(
      notificationRow(
        db,
        "progress:report-retry:webhook:DISCORD_PROGRESS_WEBHOOK_URL",
      ),
    ).toMatchObject({ status: "retry", last_error: "http_429" });
    expect(
      notificationRow(db, "progress:report-retry:channel:123456789012345678")
        .last_error,
    ).toBe("timeout");
    const progressRetry = db
      .prepare(
        "SELECT next_attempt_at FROM discord_notifications WHERE dedupe_key=?",
      )
      .get("progress:report-retry:webhook:DISCORD_PROGRESS_WEBHOOK_URL") as {
      next_attempt_at: string;
    };
    expect(Date.parse(progressRetry.next_attempt_at)).toBe(
      Date.parse("2026-10-13T00:10:00.000Z"),
    );

    const retried = await dispatchDueDiscordNotifications(env, {
      now: new Date("2026-10-13T00:10:00.000Z"),
      logger: silentLogger,
      fetcher: async (url) => {
        calls.push(url);
        return new Response(null, {
          status: url.includes("/channels/") ? 400 : 204,
        });
      },
    });

    expect(retried.notified).toBe(true);
    expect(
      notificationRow(
        db,
        "progress:report-retry:webhook:DISCORD_PROGRESS_WEBHOOK_URL",
      ).status,
    ).toBe("sent");
    expect(
      notificationRow(db, "progress:report-retry:channel:123456789012345678"),
    ).toMatchObject({ status: "failed", last_error: "http_400" });
    const callsBeforePermanent = calls.length;
    await dispatchDueDiscordNotifications(env, {
      now: new Date("2026-10-13T00:20:00.000Z"),
      logger: silentLogger,
      fetcher: async (url) => {
        calls.push(url);
        return new Response(null, { status: 204 });
      },
    });
    expect(calls).toHaveLength(callsBeforePermanent);
    expect(JSON.stringify(calls)).not.toContain("bot-secret-token");
  });

  it("returns no notification when Discord is not configured", async () => {
    const db = dbWithQueue();
    let fetches = 0;
    const summary = await deliverProgressDiscordNotification(
      notificationEnv(db),
      { reportId: "report-none", subject: null, body: progressBody },
      {
        logger: silentLogger,
        fetcher: async () => {
          fetches += 1;
          return new Response(null, { status: 204 });
        },
      },
    );
    expect(summary).toEqual({
      notified: false,
      sent: 0,
      failed: 0,
      skipped: 0,
    });
    expect(fetches).toBe(0);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM discord_notifications").get(),
    ).toEqual({
      count: 0,
    });
  });
});

const applyMigrations = (
  db: DatabaseSync,
  includeNotificationQueue: boolean,
) => {
  const directory = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(directory)
    .filter(
      (name) =>
        name.endsWith(".sql") &&
        (includeNotificationQueue || name !== "0133_discord_notifications.sql"),
    )
    .sort())
    db.exec(readFileSync(new URL(file, directory), "utf8"));
};

const workerEnvironment = (includeNotificationQueue: boolean) => {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  applyMigrations(db, includeNotificationQueue);
  const email = "editor@atlasez.test";
  const now = "2026-10-13T00:00:00.000Z";
  const token = "progress-session";
  db.prepare(
    "INSERT INTO admin_auth_sessions (session_hash,email,expires_at,created_at) VALUES (?,?,?,?)",
  ).run(
    createHash("sha256").update(token).digest("hex"),
    email,
    "2099-01-01T00:00:00.000Z",
    now,
  );
  db.prepare(
    "INSERT INTO report_admin_permissions (email,subject) VALUES (?,?)",
  ).run(email, "mathematics");
  db.prepare(
    "INSERT INTO atlasez_project_memberships (project_id,email,role,joined_at) VALUES (?,?,?,?)",
  ).run("atlas", email, "member", now);
  db.prepare(
    "INSERT INTO atlasez_project_memberships (project_id,email,role,joined_at) VALUES (?,?,?,?)",
  ).run("thinking-cafe", email, "member", now);
  const env = {
    ADMIN_AUTH_MODE: "google-oauth",
    DISCORD_ATLAS_WEBHOOK_URL: atlasWebhook,
    DISCORD_PROGRESS_WEBHOOK_URL: progressWebhook,
    REPORTS: { prepare: (query: string) => new Statement(query, db) },
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
  };
  const request = (body: Record<string, unknown>) =>
    worker.fetch(
      new Request("https://admin.atlasez.test/api/admin/operations/progress", {
        method: "POST",
        headers: {
          cookie: `atlasez_admin_session=${token}`,
          origin: "https://admin.atlasez.test",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      env as never,
    );
  return { db, env, request };
};

describe("progress report Discord acknowledgement", () => {
  it("sets discordNotified only after Discord accepts the message", async () => {
    const { db, request } = workerEnvironment(true);
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(null, { status: 204 });
    });
    const response = await request({ body: progressBody, projectId: "atlas" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, discordNotified: true });
    expect(urls).toEqual(
      expect.arrayContaining([atlasWebhook, progressWebhook]),
    );
    expect(
      db
        .prepare("SELECT COUNT(*) AS count FROM editorial_progress_reports")
        .get(),
    ).toEqual({ count: 1 });
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM discord_notifications WHERE status='sent' AND destination_ref NOT LIKE 'http%'",
        )
        .get(),
    ).toEqual({ count: 2 });
  });

  it("keeps the progress report when Discord rejects the message", async () => {
    const { db, request } = workerEnvironment(true);
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((message) => {
      errors.push(String(message));
    });
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 500 }));
    const response = await request({
      body: progressBody,
      subject: "mathematics",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, discordNotified: false });
    expect(
      db
        .prepare("SELECT COUNT(*) AS count FROM editorial_progress_reports")
        .get(),
    ).toEqual({
      count: 1,
    });
    expect(
      db
        .prepare(
          "SELECT status,last_error FROM discord_notifications ORDER BY destination_ref",
        )
        .all(),
    ).toEqual([
      { status: "retry", last_error: "http_500" },
      { status: "retry", last_error: "http_500" },
    ]);
    expect(errors.join("\n")).not.toContain(atlasWebhook);
    expect(errors.join("\n")).not.toContain(progressBody);
  });

  it("does not claim a Discord send for another project or before the queue exists", async () => {
    const withoutQueue = workerEnvironment(false);
    let fetches = 0;
    vi.stubGlobal("fetch", async () => {
      fetches += 1;
      return new Response(null, { status: 204 });
    });
    const missingQueue = await withoutQueue.request({ body: progressBody });
    expect(missingQueue.status).toBe(200);
    expect(await missingQueue.json()).toEqual({
      ok: true,
      discordNotified: false,
    });
    expect(
      withoutQueue.db
        .prepare("SELECT COUNT(*) AS count FROM editorial_progress_reports")
        .get(),
    ).toEqual({ count: 1 });
    expect(fetches).toBe(0);

    const otherProject = workerEnvironment(true);
    const response = await otherProject.request({
      body: progressBody,
      projectId: "thinking-cafe",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, discordNotified: false });
    expect(
      otherProject.db
        .prepare("SELECT COUNT(*) AS count FROM discord_notifications")
        .get(),
    ).toEqual({ count: 0 });
    expect(fetches).toBe(0);
  });
});

describe("five-minute Discord retry", () => {
  it("retries a queued notification even when another cron job fails", async () => {
    const { db, env } = workerEnvironment(true);
    db.prepare(
      `INSERT INTO discord_notifications
         (id,dedupe_key,kind,destination_kind,destination_ref,content,status,attempt_count,next_attempt_at,last_error,created_at,updated_at)
       VALUES (?,?,?,?,?,?, 'retry', 1, ?, 'http_500', ?, ?)`,
    ).run(
      "queued-1",
      "progress:queued:webhook:DISCORD_ATLAS_WEBHOOK_URL",
      "progress",
      "webhook",
      "DISCORD_ATLAS_WEBHOOK_URL",
      "📌 【全体】 進捗報告\n再送",
      "2026-10-13T00:00:00.000Z",
      "2026-10-13T00:00:00.000Z",
      "2026-10-13T00:00:00.000Z",
    );
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(null, { status: 204 });
    });
    const pending: Promise<unknown>[] = [];
    await worker.scheduled({ cron: "*/5 * * * *" }, env as never, {
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    });
    await expect(Promise.all(pending)).resolves.toHaveLength(1);
    expect(
      db
        .prepare(
          "SELECT status,attempt_count FROM discord_notifications WHERE id='queued-1'",
        )
        .get(),
    ).toEqual({ status: "sent", attempt_count: 2 });
    expect(urls).toContain(atlasWebhook);
  });
});
