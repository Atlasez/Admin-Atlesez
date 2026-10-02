import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import worker from "../../src/admin-worker";
import { dispatchApplicationEmails } from "../../src/lib/application-email-delivery";

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
});

function environment() {
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

it("全migrationを適用した隔離D1で認証・全体管理・別プロジェクト・退会後の境界を確認する", async () => {
  const { db, request } = environment();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO atlasez_member_applications(id,name,email,interests,message,status,created_at,updated_at,project_slug) VALUES (?,?,?,?,?,'accepted',?,?,?)",
  ).run(
    "isolated-member-application",
    "検証会員",
    "member@atlasez.test",
    "討論",
    "検証",
    now,
    now,
    "thinking-cafe",
  );
  db.prepare(
    "INSERT INTO editorial_member_profiles(email,display_name,bio,updated_at) VALUES (?,?,?,?)",
  ).run("member@atlasez.test", "検証会員", "基本プロフィール", now);
  db.prepare(
    "INSERT INTO editorial_project_member_profiles(project_id,email,internal_bio,updated_at) VALUES (?,?,?,?)",
  ).run(
    "thinking-cafe",
    "member@atlasez.test",
    "プロジェクト内プロフィール",
    now,
  );
  expect(
    await (await request("/api/user/status", "member@atlasez.test")).json(),
  ).toMatchObject({ stage: "MEMBER" });
  db.prepare(
    "INSERT INTO report_admin_permissions(email,subject) VALUES (?,?)",
  ).run("editor@atlasez.test", "mathematics");
  db.prepare(
    "INSERT INTO editorial_workflow_roles(email,role,subject,created_at,created_by) VALUES (?,?,?,?,?)",
  ).run(
    "coordinator@atlasez.test",
    "subject-coordinator",
    "mathematics",
    new Date().toISOString(),
    "global@atlasez.test",
  );
  db.prepare(
    "INSERT INTO report_admin_permissions(email,subject) VALUES (?,?)",
  ).run("cafe-manager@atlasez.test", "mathematics");
  db.prepare(
    "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES (?,?,?,?)",
  ).run(
    "thinking-cafe",
    "cafe-manager@atlasez.test",
    "manager",
    new Date().toISOString(),
  );
  for (const email of [
    "applicant@atlasez.test",
    "member@atlasez.test",
    "editor@atlasez.test",
    "coordinator@atlasez.test",
    "cafe-manager@atlasez.test",
  ]) {
    expect(
      (await request("/api/admin/report-admin-permissions", email)).status,
    ).toBe(403);
  }
  expect(
    (
      await request(
        "/api/admin/report-admin-permissions",
        "global@atlasez.test",
      )
    ).status,
  ).toBe(200);
  expect(
    (await request("/api/admin/editor/documents", "applicant@atlasez.test"))
      .status,
  ).toBe(403);
  expect(
    (await request("/api/admin/editor/documents", "editor@atlasez.test"))
      .status,
  ).toBe(200);
  expect(
    (await request("/api/admin/editor/documents", "coordinator@atlasez.test"))
      .status,
  ).toBe(200);
  expect(
    (
      await request(
        "/api/admin/applications?project=atlas",
        "cafe-manager@atlasez.test",
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        "/api/admin/applications?project=thinking-cafe",
        "cafe-manager@atlasez.test",
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await request(
        "/api/admin/applications?project=atlas",
        "global@atlasez.test",
      )
    ).status,
  ).toBe(200);
  const archived = await request(
    "/api/admin/member-management",
    "global@atlasez.test",
    { action: "archive", email: "editor@atlasez.test" },
  );
  expect(archived.status).toBe(200);
  expect(
    (await request("/api/admin/editor/documents", "editor@atlasez.test"))
      .status,
  ).toBe(403);
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("仮の新規利用者の基本情報保存・応募・二重応募防止・本人以外の非公開を実APIで確認する", async () => {
  const { db, request, env } = environment();
  const email = "applicant@atlasez.test";
  const profile = {
    familyName: "検証",
    givenName: "太郎",
    familyNameKana: "けんしょう",
    givenNameKana: "たろう",
    formLanguage: "ja",
    affiliationEmail: "school@atlasez.test",
    affiliationType: "大学",
    institution: "検証大学",
    grade: "B1",
    country: "日本",
    timezone: "Asia/Tokyo",
    birthDate: "2000-01-01",
    residenceCity: "検証市",
  };
  expect((await request("/api/user/status", email)).status).toBe(200);
  expect(
    (
      await request(
        "/api/application-profile",
        email,
        profile,
        "https://other.atlasez.test",
      )
    ).status,
  ).toBe(403);
  expect(
    (await request("/api/application-profile", email, profile)).status,
  ).toBe(200);
  const application = {
    projectSlug: "thinking-cafe",
    interests: "討論",
    message: "隔離検証",
    referralSource: "公式サイト",
    interviewAvailability: "平日18時 Asia/Tokyo",
    projectAnswers: { theme: "学び" },
  };
  const applied = await request("/api/apply", email, application);
  expect(applied.status, await applied.clone().text()).toBe(201);
  expect((await request("/api/apply", email, application)).status).toBe(409);
  const otherProfile = await request(
    "/api/application-profile",
    "other@atlasez.test",
  );
  expect(await otherProfile.json()).toMatchObject({ profile: null });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_member_applications WHERE email=?",
      )
      .get(email),
  ).toMatchObject({ count: 1 });
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_application_email_deliveries WHERE kind='applicant_confirmation'",
      )
      .get(),
  ).toMatchObject({ count: 1 });
  const attempts: string[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(init?.body)) as { to: string[] };
    expect(
      body.to.every((recipient) => recipient.endsWith("@atlasez.test")),
    ).toBe(true);
    attempts.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
    return new Response("{}", { status: attempts.length === 1 ? 503 : 200 });
  });
  const emailEnv = {
    ...env,
    RESEND_API_KEY: "isolated-placeholder",
    EMAIL_FROM: "sender@atlasez.test",
  };
  const now = new Date(Date.now() + 60_000);
  const logger = { info: vi.fn(), error: vi.fn() };
  expect(
    await dispatchApplicationEmails(emailEnv, { fetcher, now, logger }),
  ).toMatchObject({ failed: 1 });
  expect(
    await dispatchApplicationEmails(emailEnv, {
      fetcher,
      now: new Date(now.getTime() + 6 * 60_000),
      logger,
    }),
  ).toMatchObject({ sent: 1, failed: 0 });
  expect(attempts.at(-1)).toBe(attempts[0]);
  const callCount = fetcher.mock.calls.length;
  await dispatchApplicationEmails(emailEnv, {
    fetcher,
    now: new Date(now.getTime() + 12 * 60_000),
    logger,
  });
  expect(fetcher).toHaveBeenCalledTimes(callCount);
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("仮応募者の応募から審査受入・初回オンボーディング・会員画面までを実APIで確認する", async () => {
  const { db, request } = environment();
  const email = "journey@atlasez.test";
  const profile = {
    familyName: "実運用",
    givenName: "検証",
    familyNameKana: "じつうんよう",
    givenNameKana: "けんしょう",
    formLanguage: "ja",
    affiliationEmail: "school@atlasez.test",
    affiliationType: "大学",
    institution: "検証大学",
    grade: "B1",
    country: "日本",
    timezone: "Asia/Tokyo",
    birthDate: "2000-01-01",
    residenceCity: "検証市",
  };

  expect(
    (await request("/api/application-profile", email, profile)).status,
  ).toBe(200);
  expect(
    (
      await request("/api/apply", email, {
        projectSlug: "thinking-cafe",
        interests: "対話の場づくり",
        message: "応募から初回利用までの隔離検証",
        referralSource: "公式サイト",
        interviewAvailability: "平日18時 Asia/Tokyo",
        projectAnswers: { theme: "学び" },
      })
    ).status,
  ).toBe(201);

  const applicantStatus = await request("/api/user/status", email);
  expect(await applicantStatus.json()).toMatchObject({
    stage: "APPLICANT",
    applicationStatus: "new",
    access: { applicant: true, onboarding: false, admin: false },
  });
  const applicantSummary = await request("/api/applicant/me", email);
  expect(await applicantSummary.json()).toMatchObject({
    stage: "APPLICANT",
    basicProfileComplete: true,
    applications: [{ project: "考えるカフェ", status: "new" }],
  });
  expect((await request("/admin/member-calendar/", email)).status).toBe(302);

  const applicationId = db
    .prepare("SELECT id FROM atlasez_member_applications WHERE email=?")
    .get(email) as { id: string };
  for (const [fromState, toState, idempotencyKey] of [
    ["new", "reviewing", "journey-review-1"],
    ["reviewing", "accepted", "journey-accept-1"],
  ]) {
    const response = await request(
      "/api/admin/workflow/transition",
      "global@atlasez.test",
      {
        entityType: "application",
        entityId: applicationId.id,
        fromState,
        toState,
        idempotencyKey,
      },
    );
    expect(response.status, await response.clone().text()).toBe(200);
  }

  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM workflow_transition_events WHERE entity_id=?",
      )
      .get(applicationId.id),
  ).toEqual({ count: 2 });
  expect(
    db
      .prepare(
        "SELECT project_id,role FROM atlasez_project_memberships WHERE email=?",
      )
      .get(email),
  ).toEqual({ project_id: "thinking-cafe", role: "member" });
  expect((await request("/admin/member-calendar/", email)).status).toBe(302);
  expect(
    await (
      await request("/api/onboarding/me", email, {
        displayName: "検証メンバー",
        bio: "公開プロフィールの隔離テスト",
      })
    ).json(),
  ).toMatchObject({
    ok: true,
    stage: "ONBOARDING",
    next: "/onboarding/project/",
  });
  expect(
    await (
      await request("/api/onboarding/project", email, {
        internalBio: "プロジェクト内プロフィールの隔離テスト",
      })
    ).json(),
  ).toMatchObject({ ok: true, stage: "MEMBER", next: "/applicant/" });

  expect(await (await request("/api/user/status", email)).json()).toMatchObject(
    {
      stage: "MEMBER",
      applicationStatus: "accepted",
      applicationProjects: ["thinking-cafe"],
      access: { onboarding: false, admin: false },
    },
  );
  expect((await request("/admin/member-calendar/", email)).status).toBe(200);
  expect(
    db
      .prepare(
        "SELECT display_name,bio FROM editorial_member_profiles WHERE lower(email)=lower(?)",
      )
      .get(email),
  ).toEqual({
    display_name: "検証メンバー",
    bio: "公開プロフィールの隔離テスト",
  });
  expect(
    db
      .prepare(
        "SELECT internal_bio FROM editorial_project_member_profiles WHERE project_id='thinking-cafe' AND lower(email)=lower(?)",
      )
      .get(email),
  ).toEqual({ internal_bio: "プロジェクト内プロフィールの隔離テスト" });
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("仮応募者の見送り後は応募状況を確認でき、オンボーディングと会員利用を拒否する", async () => {
  const { db, request } = environment();
  const email = "rejected-journey@atlasez.test";
  const profile = {
    familyName: "見送り",
    givenName: "検証",
    familyNameKana: "みおくり",
    givenNameKana: "けんしょう",
    formLanguage: "ja",
    affiliationEmail: "school@atlasez.test",
    affiliationType: "大学",
    institution: "検証大学",
    grade: "B1",
    country: "日本",
    timezone: "Asia/Tokyo",
    birthDate: "2000-01-01",
    residenceCity: "検証市",
  };

  expect(
    (await request("/api/application-profile", email, profile)).status,
  ).toBe(200);
  expect(
    (
      await request("/api/apply", email, {
        projectSlug: "thinking-cafe",
        interests: "対話の場づくり",
        message: "不承認経路の隔離検証",
        referralSource: "公式サイト",
        interviewAvailability: "平日18時 Asia/Tokyo",
        projectAnswers: { theme: "学び" },
      })
    ).status,
  ).toBe(201);

  const applicationId = db
    .prepare("SELECT id FROM atlasez_member_applications WHERE email=?")
    .get(email) as { id: string };
  for (const [fromState, toState, idempotencyKey] of [
    ["new", "reviewing", "journey-reject-review-1"],
    ["reviewing", "rejected", "journey-reject-final-1"],
  ]) {
    const response = await request(
      "/api/admin/workflow/transition",
      "global@atlasez.test",
      {
        entityType: "application",
        entityId: applicationId.id,
        fromState,
        toState,
        idempotencyKey,
      },
    );
    expect(response.status, await response.clone().text()).toBe(200);
  }

  expect(await (await request("/api/user/status", email)).json()).toMatchObject(
    {
      stage: "APPLICANT",
      applicationStatus: "rejected",
      applicationProjects: [],
      access: {
        applicant: true,
        onboarding: false,
        admin: false,
      },
    },
  );
  expect(
    await (await request("/api/applicant/me", email)).json(),
  ).toMatchObject({
    stage: "APPLICANT",
    applications: [{ project: "考えるカフェ", status: "rejected" }],
  });
  expect((await request("/api/onboarding/me", email)).status).toBe(403);
  expect((await request("/admin/member-calendar/", email)).status).toBe(302);
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM atlasez_project_memberships WHERE lower(email)=lower(?)",
      )
      .get(email),
  ).toEqual({ count: 0 });
  expect(
    db
      .prepare(
        "SELECT from_state,to_state FROM workflow_transition_events WHERE entity_id=?",
      )
      .all(applicationId.id),
  ).toEqual(
    expect.arrayContaining([
      { from_state: "new", to_state: "reviewing" },
      { from_state: "reviewing", to_state: "rejected" },
    ]),
  );
  expect(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM workflow_transition_events WHERE entity_id=?",
      )
      .get(applicationId.id),
  ).toEqual({ count: 2 });
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});
