import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import worker from "../../src/admin-worker";

class Statement {
  boundValues: unknown[] = [];

  constructor(readonly query: string) {}
  bind(...values: unknown[]) {
    this.boundValues = values;
    return this;
  }
  async run() {
    return { meta: { changes: 1 } };
  }
  async all<T>() {
    return { results: [] as T[] };
  }
  async first<T>() {
    return null as T | null;
  }
}

const env = (mode: string, extra: Record<string, string> = {}) => ({
  ADMIN_AUTH_MODE: mode,
  ADMIN_PRIMARY_EMAIL: "ukyoukay0@gmail.com",
  ...extra,
  REPORTS: {
    prepare: (query: string) => new Statement(query),
    batch: async () => [],
  },
  ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
});

const stageEnv = (
  applicationStatus: string | null,
  isAdmin = false,
  profileComplete = false,
  tutorialComplete = false,
  globalManager = false,
  atlasWritingPracticeStep = 0,
  atlasWritingPracticeComplete = false,
  projectProfileComplete = profileComplete,
  sessionEmail = "applicant@example.com",
) => ({
  ADMIN_AUTH_MODE: "google-oauth",
  ADMIN_PRIMARY_EMAIL: "ukyoukay0@gmail.com",
  REPORTS: {
    prepare: (query: string) => {
      const statement = new Statement(query);
      statement.all = async <T>() => {
        if (query.includes("SELECT m.project_id,p.slug,p.name,pp.internal_bio"))
          return {
            results:
              applicationStatus === "accepted"
                ? ([
                    {
                      project_id: "atlas",
                      slug: "atlas",
                      name: "アトラス",
                      internal_bio: projectProfileComplete
                        ? "project profile"
                        : "",
                    },
                  ] as T[])
                : ([] as T[]),
          };
        if (query.includes("SELECT subject FROM report_admin_permissions"))
          return {
            results: globalManager ? ([{ subject: "*" }] as T[]) : ([] as T[]),
          };
        if (query.includes("FROM atlasez_member_applications"))
          return applicationStatus
            ? {
                results: [
                  {
                    project_slug: "atlas",
                    created_at: "2026-08-24T12:00:00.000Z",
                    status: applicationStatus,
                  },
                ] as T[],
              }
            : { results: [] as T[] };
        return { results: [] as T[] };
      };
      statement.first = async <T>() => {
        if (query.includes("admin_auth_sessions"))
          return { email: sessionEmail } as T;
        if (
          query.includes(
            "SELECT status,project_slug FROM atlasez_member_applications",
          )
        )
          return applicationStatus
            ? ({ status: applicationStatus, project_slug: "atlas" } as T)
            : null;
        if (query.includes("SELECT 1 AS found FROM report_admin_permissions"))
          return isAdmin ? ({ found: 1 } as T) : null;
        if (query.includes("SELECT bio FROM editorial_member_profiles"))
          return profileComplete ? ({ bio: "profile" } as T) : null;
        if (
          query.includes(
            "SELECT display_name,bio FROM editorial_member_profiles",
          )
        )
          return profileComplete
            ? ({ display_name: "Applicant", bio: "profile" } as T)
            : null;
        if (
          query.includes(
            "SELECT internal_bio FROM editorial_project_member_profiles",
          )
        )
          return projectProfileComplete
            ? ({ internal_bio: "project profile" } as T)
            : null;
        if (query.includes("atlasez_member_onboarding_progress"))
          return tutorialComplete
            ? ({
                tutorial_step: 4,
                tutorial_completed_at: "2026-08-24T12:00:00.000Z",
                atlas_writing_practice_step: 4,
                atlas_writing_practice_completed_at: "2026-08-24T12:00:00.000Z",
              } as T)
            : ({
                tutorial_step: 0,
                tutorial_completed_at: null,
                atlas_writing_practice_step: atlasWritingPracticeStep,
                atlas_writing_practice_completed_at:
                  atlasWritingPracticeComplete
                    ? "2026-08-24T12:00:00.000Z"
                    : null,
              } as T);
        if (query.includes("SELECT project_slug, created_at, status"))
          return applicationStatus
            ? ({
                project_slug: "atlas",
                created_at: "2026-08-24T12:00:00.000Z",
                status: applicationStatus,
              } as T)
            : null;
        return null;
      };
      return statement;
    },
    batch: async () => [],
  },
  ASSETS: {
    fetch: async () => new Response("protected page", { status: 200 }),
  },
});

const loggedInRequest = (pathname: string) =>
  new Request(`https://admin.example${pathname}`, {
    headers: { cookie: "atlasez_admin_session=logged-in" },
  });

describe("admin auth-status access capability", () => {
  it.each([
    { isGlobalManager: true, expected: true },
    { isGlobalManager: false, expected: false },
  ])(
    "reports whether the current user can open scoped admin pages",
    async ({ isGlobalManager, expected }) => {
      const response = await worker.fetch(
        loggedInRequest("/api/admin/auth-status"),
        stageEnv("accepted", false, true, false, isGlobalManager) as never,
      );

      expect(response.status).toBe(200);
      const status = (await response.json()) as {
        canAccessAdmin: boolean;
        canAccessScopedAdminPages: boolean;
      };
      expect(status.canAccessAdmin).toBe(expected);
      expect(status.canAccessScopedAdminPages).toBe(expected);
    },
  );
});

const loggedInJsonRequest = (pathname: string, body: Record<string, unknown>) =>
  new Request(`https://admin.example${pathname}`, {
    method: "POST",
    headers: {
      cookie: "atlasez_admin_session=logged-in",
      origin: "https://admin.example",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

const loggedInApiRequest = (
  pathname: string,
  method: string,
  body?: Record<string, unknown>,
) =>
  new Request(`https://admin.example${pathname}`, {
    method,
    headers: {
      cookie: "atlasez_admin_session=logged-in",
      origin: "https://admin.example",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

const projectManagerScopeEnv = () => ({
  ADMIN_AUTH_MODE: "cloudflare-access",
  REPORTS: {
    prepare: (query: string) => {
      const statement = new Statement(query);
      statement.all = async <T>() => {
        if (query.includes("SELECT subject FROM report_admin_permissions"))
          return { results: [{ subject: "mathematics" }] as T[] };
        return { results: [] as T[] };
      };
      statement.first = async <T>() => {
        if (
          query.includes("atlasez_project_memberships") &&
          query.includes("role='manager'")
        )
          return { found: 1 } as T;
        if (query.includes("SELECT 1 AS found FROM report_admin_permissions"))
          return { found: 1 } as T;
        return null as T | null;
      };
      return statement;
    },
    batch: async () => [],
  },
  ASSETS: {
    fetch: async () => new Response("protected page", { status: 200 }),
  },
});

const genreOverviewScopeEnv = (
  permissionSubject: "mathematics" | "*",
  projectRole: "member" | "manager",
) => ({
  ADMIN_AUTH_MODE: "cloudflare-access",
  REPORTS: {
    prepare: (query: string) => {
      const statement = new Statement(query);
      statement.all = async <T>() => {
        if (
          query.includes(
            "SELECT subject FROM report_admin_permissions WHERE email = ?",
          )
        )
          return { results: [{ subject: permissionSubject }] as T[] };
        if (
          query.includes("FROM editorial_workflow_roles") &&
          query.includes("lower(email) = lower(?)")
        )
          return { results: [] as T[] };
        if (query.includes("WITH raw_members AS"))
          return {
            results: [
              {
                email: "math@example.com",
                role: "member",
                display_name: "Math",
                avatar_url: "",
                university: "A",
                year: "1",
                country: "JP",
              },
              {
                email: "physics@example.com",
                role: "member",
                display_name: "Physics",
                avatar_url: "",
                university: "B",
                year: "2",
                country: "US",
              },
              {
                email: "unassigned@example.com",
                role: "member",
                display_name: "Unassigned",
                avatar_url: "",
                university: "C",
                year: "3",
                country: "UK",
              },
            ] as T[],
          };
        if (query.includes("FROM editorial_subject_overviews"))
          return {
            results: [
              {
                subject: "mathematics",
                progress: "math progress",
                updated_by: "private@example.com",
                updated_at: "2026-09-28",
              },
              {
                subject: "physics",
                progress: "physics progress",
                updated_by: "other@example.com",
                updated_at: "2026-09-27",
              },
            ] as T[],
          };
        if (query.includes("SELECT lower(email) AS email, subject"))
          return {
            results: [
              { email: "math@example.com", subject: "mathematics" },
              { email: "physics@example.com", subject: "physics" },
            ] as T[],
          };
        return { results: [] as T[] };
      };
      statement.first = async <T>() => {
        if (query.includes("FROM atlasez_projects"))
          return {
            id: "atlas",
            slug: "atlas",
            name: "Atlas",
            description: "",
          } as T;
        if (query.includes("SELECT role FROM atlasez_project_memberships"))
          return { role: projectRole } as T;
        return null as T | null;
      };
      return statement;
    },
    batch: async () => [],
  },
  ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
});

const projectOperationsRosterEnv = (
  projectRole: "member" | "manager" = "manager",
  queryLog: Statement[] = [],
  writeLog: Statement[] = [],
  taskAssigneeEmail = "other-subject@example.com",
  emailDisplayName = false,
) => ({
  ADMIN_AUTH_MODE: "cloudflare-access",
  REPORTS: {
    prepare: (query: string) => {
      const statement = new Statement(query);
      queryLog.push(statement);
      statement.all = async <T>() => {
        if (
          query.includes(
            "SELECT subject FROM report_admin_permissions WHERE email = ?",
          )
        )
          return { results: [{ subject: "mathematics" }] as T[] };
        if (query.includes("FROM editorial_workflow_roles"))
          return { results: [] as T[] };
        if (query.includes("FROM editorial_tasks"))
          return {
            results: [
              {
                id: "private-operation-task",
                project_id: "secretariat",
                subject: "mathematics",
                assignee_email: taskAssigneeEmail,
                task_kind: "task",
                title: "分野内タスク",
                details: "詳細",
                status: "open",
                due_at: null,
                due_timezone: "Asia/Tokyo",
                reminder_at: null,
                reminder_repeat: "none",
                reminder_email: "other-reminder@example.com",
                created_by: "other-creator@example.com",
                created_at: "2026-09-28T00:00:00.000Z",
                updated_at: "2026-09-28T00:00:00.000Z",
                archived_at: "2026-09-28T00:00:00.000Z",
                archived_by: "other-archiver@example.com",
                archive_expires_at: "2026-12-27T00:00:00.000Z",
              },
            ] as T[],
          };
        if (
          query.includes(
            "FROM editorial_event_availability a JOIN editorial_events e",
          )
        ) {
          const results = [
            {
              event_id: "private-operation-event",
              email: "member@example.com",
              availability: "available",
              display_name: "Project member",
            },
            {
              event_id: "private-other-subject-event",
              email: "physics-member@example.com",
              availability: "unavailable",
              display_name: "Physics participant",
            },
          ];
          return {
            results: query.includes("e.subject IN (?)")
              ? (results.filter(
                  (participant) =>
                    participant.event_id === "private-operation-event",
                ) as T[])
              : (results as T[]),
          };
        }
        if (query.includes("FROM editorial_events WHERE project_id = ?")) {
          const results = [
            {
              id: "private-operation-event",
              project_id: "secretariat",
              subject: "mathematics",
              title: "分野内日程",
              details: "",
              starts_at: "2026-09-28T09:00:00.000Z",
              ends_at: null,
              timezone: "Asia/Tokyo",
              created_by: "other-event-creator@example.com",
              created_at: "2026-09-27T00:00:00.000Z",
            },
            {
              id: "private-other-subject-event",
              project_id: "secretariat",
              subject: "physics",
              title: "別分野日程",
              details: "非公開の物理分野詳細",
              starts_at: "2026-09-29T09:00:00.000Z",
              ends_at: null,
              timezone: "Asia/Tokyo",
              created_by: "physics-creator@example.com",
              created_at: "2026-09-27T00:00:00.000Z",
            },
            {
              id: "global-operation-event",
              project_id: "secretariat",
              subject: null,
              title: "全体日程",
              details: "",
              starts_at: "2026-09-30T09:00:00.000Z",
              ends_at: null,
              timezone: "Asia/Tokyo",
              created_by: "event-creator@example.com",
              created_at: "2026-09-27T00:00:00.000Z",
            },
          ];
          return {
            results: query.includes("subject IN (?)")
              ? (results.filter(
                  (event) =>
                    event.subject === "mathematics" || event.subject === null,
                ) as T[])
              : (results as T[]),
          };
        }
        if (query.includes("SELECT DISTINCT m.email"))
          return {
            results: [
              {
                email: "manager@example.com",
                display_name: emailDisplayName
                  ? "manager@example.com"
                  : "Project manager",
              },
              { email: "member@example.com", display_name: "Project member" },
            ] as T[],
          };
        if (query.includes("FROM report_admin_permissions p"))
          return {
            results: [
              {
                email: "atlas-only@example.com",
                display_name: "Atlas operator",
              },
              {
                email: "secretariat-only@example.com",
                display_name: "Secretariat operator",
              },
            ] as T[],
          };
        return { results: [] as T[] };
      };
      statement.first = async <T>() => {
        if (query.includes("FROM editorial_tasks WHERE id=?"))
          return {
            project_id: "secretariat",
            subject: "mathematics",
            assignee_email: taskAssigneeEmail,
            task_kind: "task",
            title: "担当タスク",
            created_by: "creator@example.com",
            due_at: null,
            due_timezone: "Asia/Tokyo",
            status: "open",
            archived_at: null,
            reminder_email: "other-reminder@example.com",
          } as T;
        if (query.includes("FROM atlasez_projects WHERE id = ? OR slug = ?"))
          return {
            id: "secretariat",
            slug: "secretariat",
            name: "運営事務局",
            description: "",
          } as T;
        if (query.includes("SELECT role FROM atlasez_project_memberships"))
          return { role: projectRole } as T;
        if (query.includes("SELECT 1 AS found FROM report_admin_permissions"))
          return { found: 1 } as T;
        return null as T | null;
      };
      return statement;
    },
    batch: async (statements: Statement[]) => {
      writeLog.push(...statements);
      return [];
    },
  },
  ASSETS: {
    fetch: async () => new Response("protected page", { status: 200 }),
  },
});

describe("admin logout contract", () => {
  it("logs out through Cloudflare Access without entering Google OAuth", async () => {
    const response = await worker.fetch(
      new Request("https://admin.example/auth/logout", { method: "POST" }),
      env("cloudflare-access") as never,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://admin.example/cdn-cgi/access/logout",
    );
    expect(response.headers.get("location")).not.toContain("google/login");
  });

  it("works when Google OAuth is disabled and rejects malformed cookies safely", async () => {
    const response = await worker.fetch(
      new Request("https://admin.example/auth/logout", {
        method: "POST",
        headers: { cookie: "admin_session=%E0%A4%A" },
      }),
      env("google-oauth") as never,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://admin.example/auth/logged-out",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("does not allow cross-origin logout requests or GET logout", async () => {
    const crossOrigin = await worker.fetch(
      new Request("https://admin.example/auth/logout", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
      env("cloudflare-access") as never,
    );
    expect(crossOrigin.status).toBe(403);
    const get = await worker.fetch(
      new Request("https://admin.example/auth/logout"),
      env("cloudflare-access") as never,
    );
    expect(get.status).toBe(405);
  });

  it("normalizes OAuth return paths and rejects external redirects", async () => {
    const response = await worker.fetch(
      new Request(
        "https://admin.example/auth/google/login?returnTo=https%3A%2F%2Fevil.example%2F",
      ),
      env("google-oauth", {
        GOOGLE_OAUTH_CLIENT_ID: "client",
        GOOGLE_OAUTH_CLIENT_SECRET: "secret",
      }) as never,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "accounts.google.com/o/oauth2/v2/auth",
    );
    expect(response.headers.get("set-cookie")).not.toContain("evil.example");
  });

  it("does not create Atlas membership when a scoped admin is denied application access", async () => {
    const scopedAdminEnvironment = stageEnv(
      "accepted",
      false,
      true,
      false,
      false,
      0,
      false,
      true,
      "editor@example.com",
    );
    const membershipWrites: string[] = [];
    const prepare = scopedAdminEnvironment.REPORTS.prepare;
    scopedAdminEnvironment.REPORTS.prepare = (query: string) => {
      if (query.includes("INSERT OR IGNORE INTO atlasez_project_memberships"))
        membershipWrites.push(query);
      const statement = prepare(query);
      if (query.includes("SELECT subject FROM report_admin_permissions")) {
        statement.all = async <T>() => ({
          results: [{ subject: "physics" }] as T[],
        });
      }
      if (
        query.includes(
          "SELECT id, slug, name, description FROM atlasez_projects",
        )
      ) {
        statement.first = async <T>() =>
          ({
            id: "atlas",
            slug: "atlas",
            name: "アトラス",
            description: "",
          }) as T;
      }
      if (query.includes("SELECT role FROM atlasez_project_memberships")) {
        statement.first = async <T>() => ({ role: "member" }) as T;
      }
      return statement;
    };

    const response = await worker.fetch(
      loggedInRequest("/api/admin/applications?project=atlas"),
      scopedAdminEnvironment as never,
    );

    expect(response.status).toBe(403);
    expect(membershipWrites).toEqual([]);
  });
});

describe("Google OAuth login callback", () => {
  it("returns an administrator to the native app callback after Google OAuth", async () => {
    const state = "s".repeat(43);
    const challenge = "c".repeat(43);
    const redirectURI = "http://127.0.0.1:43127/callback";
    const returnTo = `/auth/native-app/complete?state=${state}&challenge=${challenge}&redirect_uri=${encodeURIComponent(redirectURI)}`;
    const oauthEnv = {
      ADMIN_AUTH_MODE: "google-oauth",
      ADMIN_PRIMARY_EMAIL: "admin@atlasez.org",
      ADMIN_PUBLIC_ORIGIN: "https://admin.example",
      GOOGLE_OAUTH_CLIENT_ID: "oauth-client-id",
      GOOGLE_OAUTH_CLIENT_SECRET: "oauth-client-secret",
      REPORTS: {
        prepare: (query: string) => {
          const statement = new Statement(query);
          statement.first = async <T>() => {
            if (query.includes("FROM admin_auth_sessions s"))
              return {
                email: "admin@atlasez.org",
                canonical_email: "admin@atlasez.org",
              } as T;
            if (query.includes("FROM atlasez_google_identities"))
              return null as T | null;
            if (query.includes("FROM atlasez_accounts a"))
              return {
                id: "account-1",
                canonical_email: "admin@atlasez.org",
              } as T;
            if (
              query.includes("SELECT 1 AS found FROM report_admin_permissions")
            )
              return { found: 1 } as T;
            return null as T | null;
          };
          return statement;
        },
        batch: async () => [],
      },
      ASSETS: { fetch: async () => new Response("protected page") },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "https://oauth2.googleapis.com/token")
          return new Response(
            JSON.stringify({ access_token: "access-token" }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        if (
          String(input) === "https://openidconnect.googleapis.com/v1/userinfo"
        )
          return new Response(
            JSON.stringify({
              email: "admin@atlasez.org",
              email_verified: true,
              sub: "google-subject-1",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        return new Response("unexpected OAuth request", { status: 500 });
      }),
    );

    try {
      const login = await worker.fetch(
        new Request(
          `https://admin.example/auth/google/login?returnTo=${encodeURIComponent(returnTo)}`,
        ),
        oauthEnv as never,
      );
      const authorizationURL = new URL(login.headers.get("location")!);
      const callback = await worker.fetch(
        new Request(
          `https://admin.example/auth/google/callback?code=authorization-code&state=${authorizationURL.searchParams.get("state")}`,
          {
            headers: {
              cookie: login.headers.get("set-cookie")!.split(";", 1)[0],
            },
          },
        ),
        oauthEnv as never,
      );

      expect(callback.status).toBe(302);
      const nativeCompletion = new URL(
        callback.headers.get("location")!,
        "https://admin.example",
      );
      expect(nativeCompletion.pathname).toBe("/auth/native-app/complete");
      expect(nativeCompletion.searchParams.get("state")).toBe(state);
      expect(nativeCompletion.searchParams.get("challenge")).toBe(challenge);
      expect(nativeCompletion.searchParams.get("redirect_uri")).toBe(
        redirectURI,
      );
      const sessionCookie = callback.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith("atlasez_admin_session="));
      expect(sessionCookie).toBeTruthy();

      const nativeCallback = await worker.fetch(
        new Request(nativeCompletion, {
          headers: { cookie: sessionCookie!.split(";", 1)[0] },
        }),
        oauthEnv as never,
      );
      expect(nativeCallback.status).toBe(302);
      const destination = new URL(nativeCallback.headers.get("location")!);
      expect(destination.origin).toBe("http://127.0.0.1:43127");
      expect(destination.pathname).toBe("/callback");
      expect(destination.searchParams.get("state")).toBe(state);
      expect(destination.searchParams.get("code")).toMatch(/^[0-9a-f-]{72}$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns to the requested admin page with a valid hashed session", async () => {
    const writes: Array<{ query: string; values: unknown[] }> = [];
    let accountLookupCount = 0;
    let storedSessionHash = "";
    let storedSessionExpiry = "";
    const oauthEnv = {
      ADMIN_AUTH_MODE: "google-oauth",
      ADMIN_PRIMARY_EMAIL: "admin@example.com",
      ADMIN_PUBLIC_ORIGIN: "https://admin.example",
      GOOGLE_OAUTH_CLIENT_ID: "oauth-client-id",
      GOOGLE_OAUTH_CLIENT_SECRET: "oauth-client-secret",
      REPORTS: {
        prepare: (query: string) => {
          const statement = new Statement(query);
          statement.first = async <T>() => {
            if (query.includes("FROM admin_auth_sessions s")) {
              const [candidateHash, now] = statement.boundValues;
              return candidateHash === storedSessionHash &&
                Date.parse(storedSessionExpiry) > Date.parse(String(now))
                ? ({
                    email: "admin@example.com",
                    canonical_email: "admin@example.com",
                  } as T)
                : (null as T | null);
            }
            if (query.includes("FROM atlasez_accounts a")) {
              accountLookupCount += 1;
              return accountLookupCount === 1
                ? (null as T | null)
                : ({
                    id: "account-1",
                    canonical_email: "admin@example.com",
                  } as T);
            }
            if (
              query.includes(
                "SELECT 1 AS found FROM report_admin_permissions WHERE email = ? LIMIT 1",
              )
            )
              return { found: 1 } as T;
            return null as T | null;
          };
          statement.all = async <T>() => {
            if (query.includes("SELECT subject FROM report_admin_permissions"))
              return { results: [{ subject: "*" }] as T[] };
            return { results: [] as T[] };
          };
          statement.run = async () => {
            writes.push({ query, values: [...statement.boundValues] });
            if (query.includes("INSERT INTO admin_auth_sessions")) {
              storedSessionHash = String(statement.boundValues[0] ?? "");
              storedSessionExpiry = String(statement.boundValues[4] ?? "");
            }
            return { meta: { changes: 1 } };
          };
          return statement;
        },
        batch: async () => [],
      },
      ASSETS: {
        fetch: async () =>
          new Response("protected admin page", { status: 200 }),
      },
    };
    const googleFetch = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        if (url === "https://oauth2.googleapis.com/token")
          return new Response(
            JSON.stringify({ access_token: "access-token" }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        if (url === "https://openidconnect.googleapis.com/v1/userinfo")
          return new Response(
            JSON.stringify({
              email: "admin@example.com",
              email_verified: true,
              sub: "google-subject-1",
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        return new Response("unexpected OAuth request", { status: 500 });
      },
    );

    vi.stubGlobal("fetch", googleFetch);
    try {
      const entry = await worker.fetch(
        new Request("https://admin.example/admin/operations/?project=atlas"),
        oauthEnv as never,
      );
      expect(entry.status).toBe(302);
      const loginPath = entry.headers.get("location");
      expect(loginPath).toContain("/auth/google/login?");
      const loginUrl = new URL(loginPath!, "https://admin.example");
      expect(loginUrl.searchParams.get("returnTo")).toBe(
        "/admin/operations/?project=atlas",
      );

      const login = await worker.fetch(
        new Request(`https://admin.example${loginPath}`),
        oauthEnv as never,
      );
      expect(login.status).toBe(302);
      const authorizationUrl = new URL(login.headers.get("location")!);
      const stateCookie = login.headers.get("set-cookie")!;
      const stateCookiePair = stateCookie.split(";", 1)[0];
      expect(authorizationUrl.origin).toBe("https://accounts.google.com");
      expect(authorizationUrl.pathname).toBe("/o/oauth2/v2/auth");
      expect(authorizationUrl.searchParams.get("state")).toBeTruthy();
      expect(stateCookie).toContain("Path=/auth/google");
      expect(stateCookie).toContain("HttpOnly");
      expect(stateCookie).toContain("Secure");
      expect(stateCookie).toContain("SameSite=Lax");
      expect(stateCookie).not.toContain("Domain=");

      const callback = await worker.fetch(
        new Request(
          `https://admin.example/auth/google/callback?code=authorization-code&state=${encodeURIComponent(authorizationUrl.searchParams.get("state")!)}`,
          { headers: { cookie: stateCookiePair } },
        ),
        oauthEnv as never,
      );
      expect(callback.status).toBe(302);
      expect(callback.headers.get("location")).toBe(
        "/admin/operations/?project=atlas",
      );
      expect(googleFetch).toHaveBeenCalledTimes(2);
      const tokenCall = googleFetch.mock.calls.find(
        ([input]) => String(input) === "https://oauth2.googleapis.com/token",
      );
      const tokenBody = new URLSearchParams(String(tokenCall?.[1]?.body ?? ""));
      expect(tokenCall?.[1]?.method).toBe("POST");
      expect(tokenBody.get("code")).toBe("authorization-code");
      expect(tokenBody.get("client_id")).toBe("oauth-client-id");
      expect(tokenBody.get("client_secret")).toBe("oauth-client-secret");
      expect(tokenBody.get("redirect_uri")).toBe(
        "https://admin.example/auth/google/callback",
      );
      expect(tokenBody.get("grant_type")).toBe("authorization_code");
      const userInfoCall = googleFetch.mock.calls.find(
        ([input]) =>
          String(input) === "https://openidconnect.googleapis.com/v1/userinfo",
      );
      expect(new Headers(userInfoCall?.[1]?.headers).get("authorization")).toBe(
        "Bearer access-token",
      );

      const callbackCookies = callback.headers.getSetCookie();
      const sessionCookie = callbackCookies.find((value) =>
        value.startsWith("atlasez_admin_session="),
      );
      expect(sessionCookie).toContain("Path=/; HttpOnly; Secure; SameSite=Lax");
      expect(
        callbackCookies.some(
          (value) =>
            value.startsWith("atlasez_google_oauth_state=") &&
            value.includes("Max-Age=0; Path=/auth/google"),
        ),
      ).toBe(true);

      const rawSessionToken = decodeURIComponent(
        sessionCookie!.split(";", 1)[0].split("=", 2)[1],
      );
      const sessionWrite = writes.find((write) =>
        write.query.includes("INSERT INTO admin_auth_sessions"),
      );
      expect(sessionWrite?.values[0]).toMatch(/^[a-f0-9]{64}$/);
      expect(sessionWrite?.values[0]).not.toBe(rawSessionToken);
      const sessionDigest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(rawSessionToken),
      );
      const expectedSessionHash = [...new Uint8Array(sessionDigest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      expect(sessionWrite?.values[0]).toBe(expectedSessionHash);
      expect(sessionWrite?.values.slice(1, 4)).toEqual([
        "admin@example.com",
        "account-1",
        "google-subject-1",
      ]);

      const signedInPage = await worker.fetch(
        new Request("https://admin.example/admin/operations/?project=atlas", {
          headers: { cookie: sessionCookie!.split(";", 1)[0] },
        }),
        oauthEnv as never,
      );
      expect(signedInPage.status).toBe(200);
      expect(await signedInPage.text()).toBe("protected admin page");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects a callback whose state does not match the browser cookie", async () => {
    const googleFetch = vi.fn();
    const oauthEnv = env("google-oauth", {
      GOOGLE_OAUTH_CLIENT_ID: "oauth-client-id",
      GOOGLE_OAUTH_CLIENT_SECRET: "oauth-client-secret",
    });
    vi.stubGlobal("fetch", googleFetch);
    try {
      const login = await worker.fetch(
        new Request("https://admin.example/auth/google/login"),
        oauthEnv as never,
      );
      const authorizationUrl = new URL(login.headers.get("location")!);
      const stateCookie = login.headers.get("set-cookie")!;
      const response = await worker.fetch(
        new Request(
          `https://admin.example/auth/google/callback?code=authorization-code&state=wrong-state`,
          { headers: { cookie: stateCookie.split(";", 1)[0] } },
        ),
        oauthEnv as never,
      );

      expect(authorizationUrl.searchParams.get("state")).not.toBe(
        "wrong-state",
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: "Googleログインの確認に失敗しました。もう一度お試しください。",
      });
      expect(googleFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    {
      case: "unverified email",
      userInfo: {
        email: "admin@example.com",
        email_verified: false,
        sub: "google-subject-1",
      },
    },
    {
      case: "missing Google subject",
      userInfo: {
        email: "admin@example.com",
        email_verified: true,
      },
    },
  ])("does not create a session for $case", async ({ userInfo }) => {
    const oauthEnv = env("google-oauth", {
      GOOGLE_OAUTH_CLIENT_ID: "oauth-client-id",
      GOOGLE_OAUTH_CLIENT_SECRET: "oauth-client-secret",
    });
    const prepare = vi.spyOn(oauthEnv.REPORTS, "prepare");
    const googleFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "https://oauth2.googleapis.com/token")
        return new Response(JSON.stringify({ access_token: "access-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      if (String(input) === "https://openidconnect.googleapis.com/v1/userinfo")
        return new Response(JSON.stringify(userInfo), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      return new Response("unexpected OAuth request", { status: 500 });
    });

    vi.stubGlobal("fetch", googleFetch);
    try {
      const login = await worker.fetch(
        new Request("https://admin.example/auth/google/login"),
        oauthEnv as never,
      );
      const authorizationUrl = new URL(login.headers.get("location")!);
      const stateCookie = login.headers.get("set-cookie")!.split(";", 1)[0];
      const callback = await worker.fetch(
        new Request(
          `https://admin.example/auth/google/callback?code=authorization-code&state=${encodeURIComponent(authorizationUrl.searchParams.get("state")!)}`,
          { headers: { cookie: stateCookie } },
        ),
        oauthEnv as never,
      );

      expect(callback.status).toBe(403);
      await expect(callback.json()).resolves.toMatchObject({
        error: "確認済みのGoogleメールアドレスが必要です。",
      });
      expect(callback.headers.getSetCookie()).toEqual([]);
      expect(prepare).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("standalone macOS app authentication", () => {
  it("routes app login through the existing Google OAuth callback", async () => {
    const state = "s".repeat(43);
    const challenge = "c".repeat(43);
    const redirectURI = "http://127.0.0.1:43127/callback";
    const response = await worker.fetch(
      new Request(
        `https://admin.example/auth/native-app/start?state=${state}&challenge=${challenge}&redirect_uri=${encodeURIComponent(redirectURI)}`,
      ),
      env("google-oauth", {
        GOOGLE_OAUTH_CLIENT_ID: "client-id",
        GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
      }) as never,
    );
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/auth/google/login");
    const returnTo = new URL(
      location.searchParams.get("returnTo")!,
      "https://admin.example",
    );
    expect(returnTo.pathname).toBe("/auth/native-app/complete");
    expect(returnTo.searchParams.get("state")).toBe(state);
    expect(returnTo.searchParams.get("challenge")).toBe(challenge);
    expect(returnTo.searchParams.get("redirect_uri")).toBe(redirectURI);
  });

  it("exchanges a valid one-time PKCE grant for a server-side admin session", async () => {
    const code = "11111111-1111-4111-8111-111111111111".repeat(2);
    const verifier = "verifier_value_0123456789abcdefghijklmnopqrstuvwxyz";
    const challenge = [
      ...new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        ),
      ),
    ]
      .map((byte) => String.fromCharCode(byte))
      .join("");
    const challengeEncoded = btoa(challenge)
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    let grantConsumed = false;
    const writes: { query: string; values: unknown[] }[] = [];
    const database = {
      prepare(query: string) {
        const statement = new Statement(query);
        const baseBind = statement.bind.bind(statement);
        statement.bind = (...values: unknown[]) => {
          baseBind(...values);
          return statement;
        };
        statement.first = async <T>() => {
          if (query.includes("FROM admin_native_app_grants g"))
            return (
              grantConsumed
                ? null
                : {
                    session_hash: "browser-session-hash",
                    code_challenge: challengeEncoded,
                    email: "admin@example.com",
                    account_id: "account-1",
                    google_subject: "google-subject",
                    expires_at: new Date(
                      Date.now() + 60 * 60 * 1000,
                    ).toISOString(),
                  }
            ) as T;
          return null as T;
        };
        statement.run = async () => {
          writes.push({ query, values: statement.boundValues });
          if (query.includes("DELETE FROM admin_native_app_grants")) {
            if (grantConsumed) return { meta: { changes: 0 } };
            grantConsumed = true;
          }
          return { meta: { changes: 1 } };
        };
        return statement;
      },
      batch: async () => [],
    };
    const response = await worker.fetch(
      new Request("https://admin.example/auth/native-app/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, verifier }),
      }),
      { ...env("google-oauth"), REPORTS: database } as never,
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      sessionToken: string;
      expiresAt: string;
    };
    expect(payload.sessionToken).toMatch(/^[0-9a-f-]{72}$/);
    expect(Date.parse(payload.expiresAt)).toBeGreaterThan(Date.now());
    expect(
      writes.some(({ query }) =>
        query.includes("INSERT INTO admin_auth_sessions"),
      ),
    ).toBe(true);

    const replay = await worker.fetch(
      new Request("https://admin.example/auth/native-app/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, verifier }),
      }),
      { ...env("google-oauth"), REPORTS: database } as never,
    );
    expect(replay.status).toBe(401);
  });

  it("creates an expiring app grant only from an authenticated web session", async () => {
    const state = "s".repeat(43);
    const challenge = "c".repeat(43);
    const redirectURI = "http://127.0.0.1:43127/callback";
    const writes: { query: string; values: unknown[] }[] = [];
    const database = {
      prepare(query: string) {
        const statement = new Statement(query);
        statement.first = async <T>() =>
          query.includes("FROM admin_auth_sessions s")
            ? ({
                email: "admin@example.com",
                canonical_email: "admin@example.com",
              } as T)
            : (null as T);
        statement.run = async () => {
          writes.push({ query, values: statement.boundValues });
          return {
            meta: {
              changes: query.includes("DELETE FROM admin_native_app_grants")
                ? 0
                : 1,
            },
          };
        };
        return statement;
      },
      batch: async () => [],
    };
    const response = await worker.fetch(
      new Request(
        `https://admin.example/auth/native-app/complete?state=${state}&challenge=${challenge}&redirect_uri=${encodeURIComponent(redirectURI)}`,
        {
          headers: { cookie: "atlasez_admin_session=existing-session-token" },
        },
      ),
      { ...env("google-oauth"), REPORTS: database } as never,
    );
    expect(response.status).toBe(302);
    const callback = new URL(response.headers.get("location")!);
    expect(callback.protocol).toBe("http:");
    expect(callback.hostname).toBe("127.0.0.1");
    expect(callback.port).toBe("43127");
    expect(callback.pathname).toBe("/callback");
    expect(callback.searchParams.get("state")).toBe(state);
    expect(callback.searchParams.get("code")).toMatch(/^[0-9a-f-]{72}$/);
    const grantInsert = writes.find(({ query }) =>
      query.includes("INSERT INTO admin_native_app_grants"),
    );
    expect(grantInsert?.values[1]).toMatch(/^[a-f0-9]{64}$/);
    expect(grantInsert?.values[2]).toBe(challenge);
    expect(grantInsert?.query).toContain("WHERE EXISTS");
  });

  it("rejects a grant when the PKCE verifier does not match", async () => {
    const database = {
      prepare(query: string) {
        const statement = new Statement(query);
        if (query.includes("FROM admin_native_app_grants g"))
          statement.first = async <T>() =>
            ({
              session_hash: "browser-session-hash",
              code_challenge: "not-the-challenge",
              email: "admin@example.com",
              account_id: "account-1",
              google_subject: "google-subject",
              expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            }) as T;
        return statement;
      },
      batch: async () => [],
    };
    const response = await worker.fetch(
      new Request("https://admin.example/auth/native-app/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: "11111111-1111-4111-8111-111111111111".repeat(2),
          verifier: "v".repeat(43),
        }),
      }),
      { ...env("google-oauth"), REPORTS: database } as never,
    );
    expect(response.status).toBe(401);
  });
});

describe("admin API scope gate", () => {
  it("rejects authenticated users without an admin scope before handler-specific work", async () => {
    const response = await worker.fetch(
      new Request("https://admin.example/api/admin/google-accounts", {
        headers: {
          "Cf-Access-Authenticated-User-Email": "member@example.com",
        },
      }),
      env("cloudflare-access") as never,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "この管理画面の閲覧権限が設定されていません。",
    });
  });

  it("keeps the member profile endpoint on its self-service scope", async () => {
    const response = await worker.fetch(
      loggedInRequest("/api/admin/profile"),
      stageEnv("accepted", false, true) as never,
    );

    expect(response.status).toBe(200);
  });

  it.each([
    "/admin/member-management/?project=atlas",
    "/admin/genre-roles/?project=atlas",
    "/admin/operations-statistics/?project=atlas",
    "/api/admin/genre-overviews?project=atlas&limit=50",
    "/api/admin/audit-log",
    "/api/admin/workflow/transitions",
    "/api/admin/workflow/diagnostics",
  ])(
    "keeps global member and operations data out of project-manager scope: %s",
    async (path) => {
      const response = await worker.fetch(
        new Request(`https://admin.example${path}`, {
          headers: {
            "Cf-Access-Authenticated-User-Email": "manager@example.com",
          },
        }),
        projectManagerScopeEnv() as never,
      );

      expect(response.status).toBe(403);
    },
  );

  it("limits the unpaginated genre overview to assigned subjects and removes other members' private fields", async () => {
    const response = await worker.fetch(
      new Request(
        "https://admin.example/api/admin/genre-overviews?project=atlas",
        {
          headers: {
            "Cf-Access-Authenticated-User-Email": "manager@example.com",
          },
        },
      ),
      genreOverviewScopeEnv("mathematics", "member") as never,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      members: Array<Record<string, unknown>>;
      overviews: Array<Record<string, unknown>>;
    };
    expect(data.members).toHaveLength(1);
    expect(data.members[0]).toMatchObject({
      display_name: "Math",
      subjectAssignments: ["mathematics"],
    });
    expect(data.members[0]).not.toHaveProperty("email");
    expect(data.members[0]).not.toHaveProperty("university");
    expect(data.overviews).toEqual([
      {
        subject: "mathematics",
        progress: "math progress",
        updated_at: "2026-09-28",
      },
    ]);
    expect(data.overviews[0]).not.toHaveProperty("updated_by");
  });

  it("lets a project manager read project progress without exposing the full member roster", async () => {
    const response = await worker.fetch(
      new Request(
        "https://admin.example/api/admin/genre-overviews?project=atlas",
        {
          headers: {
            "Cf-Access-Authenticated-User-Email": "manager@example.com",
          },
        },
      ),
      genreOverviewScopeEnv("mathematics", "manager") as never,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      members: Array<Record<string, unknown>>;
      overviews: Array<Record<string, unknown>>;
    };
    expect(data.members).toHaveLength(1);
    expect(data.members[0]).toMatchObject({ display_name: "Math" });
    expect(data.members[0]).not.toHaveProperty("email");
    expect(data.members[0]).not.toHaveProperty("university");
    expect(data.overviews).toHaveLength(2);
    expect(data.overviews[0]).not.toHaveProperty("updated_by");
  });

  it("limits operations assignee candidates to the selected project roster", async () => {
    const queryLog: Statement[] = [];
    const response = await worker.fetch(
      new Request(
        "https://admin.example/api/admin/operations?project=secretariat",
        {
          headers: {
            "Cf-Access-Authenticated-User-Email": "manager@example.com",
          },
        },
      ),
      projectOperationsRosterEnv("manager", queryLog) as never,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      members: Array<{ email: string; display_name: string }>;
    };
    expect(data.members).toEqual([
      { email: "manager@example.com", display_name: "Project manager" },
      { email: "member@example.com", display_name: "Project member" },
    ]);
    expect(data.members.map((member) => member.email)).not.toContain(
      "atlas-only@example.com",
    );
    expect(data.members.map((member) => member.email)).not.toContain(
      "secretariat-only@example.com",
    );
    const rosterQuery = queryLog.find((entry) =>
      entry.query.includes("SELECT DISTINCT m.email"),
    );
    expect(rosterQuery?.query).toContain("WHERE m.project_id=?");
    expect(rosterQuery?.boundValues).toEqual(["secretariat"]);
  });

  it("intersects project member candidates with a limited operator's assigned subjects", async () => {
    const queryLog: Statement[] = [];
    const response = await worker.fetch(
      new Request(
        "https://admin.example/api/admin/operations?project=secretariat",
        {
          headers: {
            "Cf-Access-Authenticated-User-Email": "member@example.com",
          },
        },
      ),
      projectOperationsRosterEnv("member", queryLog) as never,
    );

    expect(response.status).toBe(200);
    const rosterQuery = queryLog.find((entry) =>
      entry.query.includes("SELECT DISTINCT m.email"),
    );
    expect(rosterQuery?.query).toContain("WHERE m.project_id=?");
    expect(rosterQuery?.query).toContain("permission.subject IN (?)");
    expect(rosterQuery?.boundValues).toEqual(["secretariat", "mathematics"]);
  });

  it("hides other members' email addresses in scoped operation data", async () => {
    const queryLog: Statement[] = [];
    const response = await worker.fetch(
      new Request(
        "https://admin.example/api/admin/operations?project=secretariat",
        {
          headers: {
            "Cf-Access-Authenticated-User-Email": "member@example.com",
          },
        },
      ),
      projectOperationsRosterEnv(
        "member",
        queryLog,
        [],
        "manager@example.com",
        true,
      ) as never,
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    for (const email of [
      "other-creator@example.com",
      "other-archiver@example.com",
      "other-reminder@example.com",
      "other-event-creator@example.com",
      "physics-creator@example.com",
      "physics-member@example.com",
    ])
      expect(body).not.toContain(email);
    expect(body).not.toContain("別分野日程");
    expect(body).not.toContain("非公開の物理分野詳細");
    expect(body).toContain("全体日程");
    const payload = JSON.parse(body) as {
      tasks: Array<Record<string, unknown>>;
      members: Array<Record<string, unknown>>;
    };
    expect(payload.tasks[0]).not.toHaveProperty("assignee_email");
    expect(payload.tasks[0]).toMatchObject({
      assignee_display_name: "表示名未設定",
      created_by_display_name: "他のメンバー",
      can_update: false,
    });
    expect(payload.members).toContainEqual(
      expect.objectContaining({
        email: "manager@example.com",
        display_name: "表示名未設定",
      }),
    );
    expect(body).toContain('"created_by_display_name":"他のメンバー"');
    expect(body).toContain('"reminder_email_hidden":true');
    expect(body).toContain('"created_by_me":false');
    expect(body).toContain('"assigned_to_me":false');
    const eventQuery = queryLog.find((entry) =>
      entry.query.includes("FROM editorial_events WHERE project_id = ?"),
    );
    expect(eventQuery?.query).toContain("subject IS NULL OR subject IN (?)");
    expect(eventQuery?.boundValues).toEqual(["secretariat", "mathematics", 51]);
    const participantQuery = queryLog.find((entry) =>
      entry.query.includes(
        "FROM editorial_event_availability a JOIN editorial_events e",
      ),
    );
    expect(participantQuery?.query).toContain(
      "e.subject IS NULL OR e.subject IN (?)",
    );
    expect(participantQuery?.boundValues).toEqual([
      "secretariat",
      "mathematics",
      "secretariat",
      "mathematics",
      51,
    ]);
  });

  it("labels unassigned scoped tasks without exposing an email", async () => {
    const response = await worker.fetch(
      new Request(
        "https://admin.example/api/admin/operations?project=secretariat",
        {
          headers: {
            "Cf-Access-Authenticated-User-Email": "member@example.com",
          },
        },
      ),
      projectOperationsRosterEnv("member", [], [], "") as never,
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('"assignee_display_name":"担当未指定"');
    expect(body).not.toContain('"assignee_email"');
  });

  it("preserves a hidden reminder recipient when scoped users update reminder times", async () => {
    const writeLog: Statement[] = [];
    const response = await worker.fetch(
      new Request(
        "https://admin.example/api/admin/operations/tasks/11111111-1111-4111-8111-111111111111",
        {
          method: "PATCH",
          headers: {
            "Cf-Access-Authenticated-User-Email": "member@example.com",
            origin: "https://admin.example",
            "content-type": "application/json",
          },
          body: JSON.stringify({ reminderAction: "replace", reminders: [] }),
        },
      ),
      projectOperationsRosterEnv(
        "member",
        [],
        writeLog,
        "member@example.com",
      ) as never,
    );

    expect(response.status, await response.clone().text()).toBe(200);
    const reminderUpdate = writeLog.find((statement) =>
      statement.query.includes(
        "UPDATE editorial_tasks SET reminder_at=?,reminder_repeat=?,reminder_email=?,updated_at=? WHERE id=?",
      ),
    );
    expect(reminderUpdate?.boundValues[2]).toBe("other-reminder@example.com");
  });

  it("still rejects an explicitly unauthorized reminder recipient", async () => {
    const writeLog: Statement[] = [];
    const response = await worker.fetch(
      new Request(
        "https://admin.example/api/admin/operations/tasks/11111111-1111-4111-8111-111111111111",
        {
          method: "PATCH",
          headers: {
            "Cf-Access-Authenticated-User-Email": "member@example.com",
            origin: "https://admin.example",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            reminderAction: "replace",
            reminders: [],
            reminderEmail: "outside@example.com",
          }),
        },
      ),
      projectOperationsRosterEnv(
        "member",
        [],
        writeLog,
        "member@example.com",
      ) as never,
    );

    expect(response.status).toBe(403);
    expect(writeLog).toHaveLength(0);
  });

  it("preserves full genre overviews for a global administrator", async () => {
    const response = await worker.fetch(
      new Request(
        "https://admin.example/api/admin/genre-overviews?project=atlas",
        {
          headers: {
            "Cf-Access-Authenticated-User-Email": "manager@example.com",
          },
        },
      ),
      genreOverviewScopeEnv("*", "member") as never,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      members: Array<Record<string, unknown>>;
      overviews: Array<Record<string, unknown>>;
    };
    expect(data.members).toHaveLength(3);
    expect(data.members[0]).toHaveProperty("email");
    expect(data.members[0]).toHaveProperty("university");
    expect(data.overviews).toHaveLength(2);
    expect(data.overviews[0]).toHaveProperty("updated_by");
  });

  it("does not expose member email addresses as display-name fallbacks in task data", async () => {
    const memberEnvironment = stageEnv(
      "accepted",
      false,
      true,
      false,
      false,
      0,
      false,
      true,
      "member@example.com",
    );
    const memberEmails = [
      "assignee-private@example.com",
      "author-private@example.com",
    ];
    let memberNamesQuery = "";
    const prepare = memberEnvironment.REPORTS.prepare;
    memberEnvironment.REPORTS.prepare = (query: string) => {
      const statement = prepare(query);
      if (query.includes("SELECT p.id,p.slug,p.name,p.description,m.role")) {
        statement.all = async <T>() => ({
          results: [
            {
              id: "atlas",
              slug: "atlas",
              name: "Atlas",
              description: "",
              role: "member",
            },
          ] as T[],
        });
      } else if (query.includes("SELECT m.project_id,m.email")) {
        memberNamesQuery = query;
        statement.all = async <T>() => ({
          results: memberEmails.map((email) => ({
            project_id: "atlas",
            email,
            display_name: "",
          })) as T[],
        });
      } else if (
        query.includes(
          "SELECT id,project_id,subject,assignee_email,task_kind,title,details,status,due_at,due_timezone",
        )
      ) {
        statement.all = async <T>() => ({
          results: [
            {
              id: "task-private-identities",
              project_id: "atlas",
              subject: null,
              assignee_email: memberEmails[0],
              task_kind: "task",
              title: "共有タスク",
              details: "詳細",
              status: "open",
              due_at: null,
              due_timezone: "Asia/Tokyo",
              created_by: memberEmails[1],
              created_at: "2026-09-28T00:00:00.000Z",
              updated_at: "2026-09-28T00:00:00.000Z",
              archived_at: null,
              archived_by: null,
            },
          ] as T[],
        });
      }
      return statement;
    };

    const response = await worker.fetch(
      loggedInRequest("/api/admin/member-tasks"),
      memberEnvironment as never,
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain(memberEmails[0]);
    expect(body).not.toContain(memberEmails[1]);
    expect(memberNamesQuery).toContain(
      "COALESCE(NULLIF(TRIM(p.display_name),''),'') AS display_name",
    );
    expect(body).toContain('"assignee_display_name":"メンバー"');
    expect(body).toContain('"created_by_display_name":"メンバー"');
  });
});

describe("applicant stage server-side access", () => {
  it("keeps the designated primary admin in the admin stage if the seed row is missing", async () => {
    const rootPage = await worker.fetch(
      loggedInRequest("/"),
      stageEnv(
        "reviewing",
        false,
        false,
        false,
        false,
        0,
        false,
        false,
        "ukyoukay0@gmail.com",
      ) as never,
    );
    expect(rootPage.status).toBe(302);
    expect(rootPage.headers.get("location")).toBe(
      "https://admin.example/admin/portal/",
    );
  });

  it("shows the designated primary admin in the permissions list if the seed row is missing", async () => {
    const response = await worker.fetch(
      new Request("https://admin.example/api/admin/report-admin-permissions", {
        headers: {
          "Cf-Access-Authenticated-User-Email": "ukyoukay0@gmail.com",
        },
      }),
      env("cloudflare-access") as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      permissions: [
        expect.objectContaining({
          email: "ukyoukay0@gmail.com",
          subjects: "*",
          display_name: "主管理者",
        }),
      ],
    });
  });

  it("keeps the legacy full-list response when permissions pagination is not requested", async () => {
    const queries: string[] = [];
    const reports = {
      prepare: (query: string) => {
        queries.push(query);
        return new Statement(query);
      },
      batch: async () => [],
    };
    const response = await worker.fetch(
      new Request("https://admin.example/api/admin/report-admin-permissions", {
        headers: {
          "Cf-Access-Authenticated-User-Email": "ukyoukay0@gmail.com",
        },
      }),
      {
        ADMIN_AUTH_MODE: "cloudflare-access",
        ADMIN_PRIMARY_EMAIL: "ukyoukay0@gmail.com",
        REPORTS: reports,
        ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
      } as never,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data).not.toHaveProperty("pagination");
    const permissionQuery = queries.find((query) =>
      query.includes("GROUP_CONCAT(DISTINCT p.subject)"),
    );
    expect(permissionQuery).toBeDefined();
    expect(permissionQuery).not.toContain("LIMIT ?");
  });

  it("keeps reserved verification accounts out of the normal permission list", async () => {
    const reports = {
      prepare: (query: string) => {
        const statement = new Statement(query);
        statement.all = async <T>() => {
          if (query.includes("GROUP_CONCAT(DISTINCT p.subject)"))
            return {
              results: [
                {
                  email: "operator@example.com",
                  subjects: "mathematics",
                  display_name: "検証アカウント",
                  university: "",
                  year: "",
                  interests: "",
                  avatar_url: "",
                  discord_user_id: "",
                },
              ] as T[],
            };
          return { results: [] as T[] };
        };
        return statement;
      },
      batch: async () => [],
    };
    const response = await worker.fetch(
      new Request("https://admin.example/api/admin/report-admin-permissions", {
        headers: {
          "Cf-Access-Authenticated-User-Email": "ukyoukay0@gmail.com",
        },
      }),
      {
        ADMIN_AUTH_MODE: "cloudflare-access",
        ADMIN_PRIMARY_EMAIL: "ukyoukay0@gmail.com",
        REPORTS: reports,
        ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
      } as never,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      permissions?: Array<{ email?: string }>;
    };
    expect(
      data.permissions?.some(
        (member) => member.email === "operator@example.com",
      ),
    ).toBe(false);
  });

  it("exposes reserved verification accounts through the isolated endpoint", async () => {
    const reports = {
      prepare: (query: string) => {
        const statement = new Statement(query);
        statement.all = async <T>() =>
          query.includes("candidate_members")
            ? ({
                results: [
                  {
                    email: "operator@example.com",
                    display_name: "検証アカウント",
                    avatar_url: "",
                  },
                ],
              } as { results: T[] })
            : ({ results: [] } as { results: T[] });
        return statement;
      },
      batch: async () => [],
    };
    const response = await worker.fetch(
      new Request("https://admin.example/api/admin/verification-members", {
        headers: {
          "Cf-Access-Authenticated-User-Email": "ukyoukay0@gmail.com",
        },
      }),
      {
        ADMIN_AUTH_MODE: "cloudflare-access",
        ADMIN_PRIMARY_EMAIL: "ukyoukay0@gmail.com",
        REPORTS: reports,
        ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
      } as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      members: [{ email: "operator@example.com" }],
    });
  });

  it("paginates permission audit entries with a stable cursor", async () => {
    const queries: string[] = [];
    const reports = {
      prepare: (query: string) => {
        queries.push(query);
        const statement = new Statement(query);
        statement.all = async <T>() => {
          if (query.includes("SELECT subject FROM report_admin_permissions"))
            return { results: [{ subject: "*" }] as T[] };
          if (
            query.includes("SELECT role, subject FROM editorial_workflow_roles")
          )
            return { results: [] as T[] };
          if (query.includes("FROM admin_permission_audit_log"))
            return {
              results: [
                {
                  id: "audit-2",
                  actor_email: "admin@example.com",
                  target_email: "member@example.com",
                  action: "grant",
                  before_subjects: "",
                  after_subjects: "mathematics",
                  created_at: "2026-09-10T02:00:00.000Z",
                },
                {
                  id: "audit-1",
                  actor_email: "admin@example.com",
                  target_email: "member@example.com",
                  action: "revoke",
                  before_subjects: "mathematics",
                  after_subjects: "",
                  created_at: "2026-09-10T01:00:00.000Z",
                },
              ] as T[],
            };
          return { results: [] as T[] };
        };
        return statement;
      },
      batch: async () => [],
    };
    const response = await worker.fetch(
      new Request("https://admin.example/api/admin/permission-audit?limit=1", {
        headers: { "Cf-Access-Authenticated-User-Email": "admin@example.com" },
      }),
      {
        ADMIN_AUTH_MODE: "cloudflare-access",
        REPORTS: reports,
        ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
      } as never,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      entries: Array<{ id: string }>;
      pagination: { hasMore: boolean; nextCursor: string | null };
    };
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]?.id).toBe("audit-2");
    expect(data.pagination.hasMore).toBe(true);
    expect(data.pagination.nextCursor).toBe(
      "2026-09-10T02%3A00%3A00.000Z|audit-2",
    );
    expect(
      queries.find((query) =>
        query.includes("FROM admin_permission_audit_log"),
      ),
    ).toContain("LIMIT ?");
    expect(
      queries.find((query) =>
        query.includes("FROM admin_permission_audit_log"),
      ),
    ).toContain("archived_at IS NULL");

    const archivedResponse = await worker.fetch(
      new Request(
        "https://admin.example/api/admin/permission-audit?limit=1&includeArchived=1",
        {
          headers: {
            "Cf-Access-Authenticated-User-Email": "admin@example.com",
          },
        },
      ),
      {
        ADMIN_AUTH_MODE: "cloudflare-access",
        REPORTS: reports,
        ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
      } as never,
    );
    expect(archivedResponse.status).toBe(200);
    await expect(archivedResponse.json()).resolves.toMatchObject({
      includeArchived: true,
    });
    const archivedQuery = queries
      .filter((query) => query.includes("FROM admin_permission_audit_log"))
      .at(-1);
    expect(archivedQuery).not.toContain("archived_at IS NULL");
  });

  it("paginates GitHub update history by page and reports continuation", async () => {
    const requests: string[] = [];
    const reports = {
      prepare: (query: string) => {
        const statement = new Statement(query);
        statement.all = async <T>() =>
          query.includes("SELECT subject FROM report_admin_permissions")
            ? { results: [{ subject: "*" }] as T[] }
            : { results: [] as T[] };
        return statement;
      },
      batch: async () => [],
    };
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return new Response(
        JSON.stringify([
          {
            sha: "abcdef1234567",
            html_url: "https://github.com/Atlasez/Admin-Atlesez/commit/abcdef1",
            commit: {
              message: "perf: 履歴を段階取得",
              author: { name: "運営チーム", date: "2026-09-10T03:00:00.000Z" },
            },
            author: { login: "atlasez" },
          },
          {
            sha: "123456789abcd",
            html_url: "https://github.com/Atlasez/Admin-Atlesez/commit/1234567",
            commit: {
              message: "fix: 表示を安定化",
              author: { name: "運営チーム", date: "2026-09-09T03:00:00.000Z" },
            },
            author: { login: "atlasez" },
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    try {
      const response = await worker.fetch(
        new Request(
          "https://admin.example/api/admin/update-history?limit=2&page=3",
          {
            headers: {
              "Cf-Access-Authenticated-User-Email": "admin@example.com",
            },
          },
        ),
        {
          ADMIN_AUTH_MODE: "cloudflare-access",
          REPORTS: reports,
          ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
        } as never,
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        entries: Array<{ title: string }>;
        pagination: {
          page: number;
          limit: number;
          hasMore: boolean;
          nextPage: number | null;
        };
      };
      expect(data.entries).toHaveLength(2);
      expect(data.entries[0]?.title).toBe("履歴を段階取得");
      expect(data.pagination).toEqual({
        page: 3,
        limit: 2,
        hasMore: true,
        nextPage: 4,
      });
      expect(requests[0]).toContain("per_page=2&page=3");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("normalizes GitHub connection failures for the retry UI", async () => {
    const reports = {
      prepare: (query: string) => {
        const statement = new Statement(query);
        statement.all = async <T>() =>
          query.includes("SELECT subject FROM report_admin_permissions")
            ? { results: [{ subject: "*" }] as T[] }
            : { results: [] as T[] };
        return statement;
      },
      batch: async () => [],
    };
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("network unavailable");
    });
    try {
      const response = await worker.fetch(
        new Request("https://admin.example/api/admin/update-history", {
          headers: {
            "Cf-Access-Authenticated-User-Email": "admin@example.com",
          },
        }),
        {
          ADMIN_AUTH_MODE: "cloudflare-access",
          REPORTS: reports,
          ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
        } as never,
      );
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({
        code: "GITHUB_UNAVAILABLE",
        retryable: true,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects an unexpected GitHub response instead of throwing from the history page", async () => {
    const reports = {
      prepare: (query: string) => {
        const statement = new Statement(query);
        statement.all = async <T>() =>
          query.includes("SELECT subject FROM report_admin_permissions")
            ? { results: [{ subject: "*" }] as T[] }
            : { results: [] as T[] };
        return statement;
      },
      batch: async () => [],
    };
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ message: "rate limit" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    try {
      const response = await worker.fetch(
        new Request("https://admin.example/api/admin/update-history", {
          headers: {
            "Cf-Access-Authenticated-User-Email": "admin@example.com",
          },
        }),
        {
          ADMIN_AUTH_MODE: "cloudflare-access",
          REPORTS: reports,
          ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
        } as never,
      );
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({
        code: "GITHUB_INVALID_RESPONSE",
        retryable: true,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("requires an authenticated Google session before accepting an application", async () => {
    const response = await worker.fetch(
      new Request("https://admin.example/api/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      env("google-oauth") as never,
    );
    expect(response.status).toBe(401);
  });

  it("accepts a complete student-council application and records its project", async () => {
    const inserts: unknown[][] = [];
    const applicationEnv = {
      ADMIN_AUTH_MODE: "google-oauth",
      REPORTS: {
        prepare: (query: string) => {
          const statement = new Statement(query);
          statement.first = async <T>() => {
            if (query.includes("admin_auth_sessions"))
              return { email: "council-applicant@example.com" } as T;
            return null as T | null;
          };
          statement.run = async () => {
            if (query.includes("INSERT INTO atlasez_member_applications"))
              inserts.push([]);
            return { meta: { changes: 1 } };
          };
          return statement;
        },
        batch: async () => [],
      },
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    };
    const response = await worker.fetch(
      new Request("https://admin.example/api/apply", {
        method: "POST",
        headers: {
          cookie: "atlasez_admin_session=logged-in",
          origin: "https://admin.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectSlug: "student-council-exchange",
          familyName: "テスト",
          givenName: "太郎",
          familyNameKana: "てすと",
          givenNameKana: "たろう",
          formLanguage: "ja",
          affiliationEmail: "student@school.example",
          affiliationType: "高等学校",
          institution: "テスト高等学校",
          grade: "高2",
          country: "日本",
          timezone: "Asia/Tokyo",
          birthDate: "2008-01-01",
          residenceCity: "東京都",
          referralSource: "テスト",
          interests: "企画運営",
          message: "応募テストです。",
          motivationReasons: "活動に参加したい。",
          desiredRoles: "企画",
          interviewAvailability: "平日夕方",
          projectAnswers: {
            councilStatus: "生徒会所属中",
            councilRole: "書記",
            councilPlans: "学校を越えた交流会を企画したい。",
          },
        }),
      }),
      applicationEnv as never,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(inserts).toHaveLength(1);
  });

  it("sends a Google-authenticated user without an application to the applicant start page", async () => {
    const applicantPage = await worker.fetch(
      loggedInRequest("/applicant/"),
      stageEnv(null) as never,
    );
    expect(applicantPage.status).toBe(200);

    const adminPage = await worker.fetch(
      loggedInRequest("/admin/portal/"),
      stageEnv(null) as never,
    );
    expect(adminPage.status).toBe(302);
    expect(adminPage.headers.get("location")).toBe(
      "https://admin.example/applicant/",
    );

    const applicationPage = await worker.fetch(
      loggedInRequest("/apply/"),
      stageEnv(null) as never,
    );
    expect(applicationPage.status).not.toBe(302);
  });

  it("unlocks only the applicant page after submission and keeps admin closed", async () => {
    const applicantPage = await worker.fetch(
      loggedInRequest("/applicant/"),
      stageEnv("reviewing") as never,
    );
    expect(applicantPage.status).toBe(200);

    const adminPage = await worker.fetch(
      loggedInRequest("/admin/portal/"),
      stageEnv("reviewing") as never,
    );
    expect(adminPage.status).toBe(302);
    expect(adminPage.headers.get("location")).toBe(
      "https://admin.example/applicant/",
    );
  });

  it("lets completed members use member pages and prevents a portal self-redirect", async () => {
    const memberEnvironment = stageEnv(
      "accepted",
      false,
      true,
      false,
      false,
      0,
      false,
      true,
    );
    for (const pathname of [
      "/admin/portal/",
      "/admin/member-tasks/",
      "/admin/task-detail/",
      "/admin/task-templates/",
      "/admin/member-calendar/",
    ]) {
      const response = await worker.fetch(
        loggedInRequest(pathname),
        memberEnvironment as never,
      );
      expect(response.status, pathname).toBe(200);
    }

    const adminPage = await worker.fetch(
      loggedInRequest("/admin/permissions/"),
      memberEnvironment as never,
    );
    expect(adminPage.status).toBe(302);
    expect(adminPage.headers.get("location")).toBe(
      "https://admin.example/admin/portal/",
    );
    const memberHome = await worker.fetch(
      loggedInRequest("/admin/portal/"),
      memberEnvironment as never,
    );
    expect(memberHome.status).toBe(200);
  });

  it("limits completed members to their portal and member-only APIs", async () => {
    const memberEnvironment = stageEnv(
      "accepted",
      false,
      true,
      false,
      false,
      0,
      false,
      true,
    );
    const membershipWrites: string[] = [];
    const prepare = memberEnvironment.REPORTS.prepare;
    memberEnvironment.REPORTS.prepare = (query: string) => {
      if (query.includes("INSERT OR IGNORE INTO atlasez_project_memberships"))
        membershipWrites.push(query);
      return prepare(query);
    };
    for (const pathname of [
      "/api/admin/portal",
      "/api/admin/member-tasks",
      "/api/admin/my-access",
      "/api/admin/member-calendar",
      "/api/admin/notifications",
    ]) {
      const response = await worker.fetch(
        loggedInRequest(pathname),
        memberEnvironment as never,
      );
      expect(response.status, pathname).toBe(200);
    }

    const notificationPage = await worker.fetch(
      loggedInRequest("/admin/notifications/"),
      memberEnvironment as never,
    );
    expect(notificationPage.status).toBe(200);

    const notificationRead = await worker.fetch(
      loggedInJsonRequest("/api/admin/notifications/read", {
        ids: ["comment-12345678"],
      }),
      memberEnvironment as never,
    );
    expect(notificationRead.status).toBe(200);
    expect(membershipWrites).toEqual([]);

    const markAllNotificationsRead = await worker.fetch(
      loggedInJsonRequest("/api/admin/notifications/read", { all: true }),
      memberEnvironment as never,
    );
    expect(markAllNotificationsRead.status).toBe(200);
    expect(await markAllNotificationsRead.json()).toMatchObject({
      ok: true,
      markedCount: 0,
    });

    const adminApi = await worker.fetch(
      loggedInRequest("/api/admin/article-reports"),
      memberEnvironment as never,
    );
    expect(adminApi.status).toBe(403);
    const statisticsApi = await worker.fetch(
      loggedInRequest("/api/admin/operations-statistics"),
      memberEnvironment as never,
    );
    expect(statisticsApi.status).toBe(403);

    const applicantApi = await worker.fetch(
      loggedInRequest("/api/admin/portal"),
      stageEnv("new", false, true) as never,
    );
    expect(applicantApi.status).toBe(403);

    const unauthenticatedApi = await worker.fetch(
      new Request("https://admin.example/api/admin/portal"),
      memberEnvironment as never,
    );
    expect(unauthenticatedApi.status).toBe(401);
  });

  it("allows only the explicitly member-scoped operation methods through the common admin gate", async () => {
    const memberEnvironment = stageEnv(
      "accepted",
      false,
      true,
      false,
      false,
      0,
      false,
      true,
      "member@example.com",
    );
    const memberMethods = [
      [
        "POST",
        "/api/admin/operations/availability-blocks",
        { startsAt: "2026-10-01T10:00", endsAt: "2026-10-01T11:00" },
        200,
      ],
      ["POST", "/api/admin/operations/availability-rules", { weekday: 1 }, 200],
      [
        "DELETE",
        "/api/admin/operations/availability-blocks/123e4567-e89b-12d3-a456-426614174000",
        undefined,
        200,
      ],
      [
        "DELETE",
        "/api/admin/operations/availability-rules/123e4567-e89b-12d3-a456-426614174000",
        undefined,
        200,
      ],
      [
        "PATCH",
        "/api/admin/operations/tasks/123e4567-e89b-12d3-a456-426614174000",
        { status: "doing" },
        404,
      ],
      [
        "PUT",
        "/api/admin/operations/events/123e4567-e89b-12d3-a456-426614174000/availability",
        { availability: "available" },
        404,
      ],
    ] as const;

    for (const [method, path, body, expectedStatus] of memberMethods) {
      const response = await worker.fetch(
        loggedInApiRequest(path, method, body),
        memberEnvironment as never,
      );
      expect(response.status, `${method} ${path}`).toBe(expectedStatus);
    }

    const adminOnlyApi = await worker.fetch(
      loggedInApiRequest("/api/admin/operations/progress", "POST", {
        body: "test",
      }),
      memberEnvironment as never,
    );
    expect(adminOnlyApi.status).toBe(403);
  });

  it("does not create a workflow or audit event when a task is saved in its current state", async () => {
    const memberEnvironment = stageEnv(
      "accepted",
      false,
      true,
      false,
      false,
      0,
      false,
      true,
      "member@example.com",
    );
    const sideEffectQueries: string[] = [];
    const prepare = memberEnvironment.REPORTS.prepare;
    memberEnvironment.REPORTS.prepare = (query: string) => {
      const statement = prepare(query);
      if (
        query.includes(
          "SELECT id, slug, name, description FROM atlasez_projects",
        )
      ) {
        statement.first = async <T>() =>
          ({ id: "atlas", slug: "atlas", name: "Atlas", description: "" }) as T;
      } else if (
        query.includes("SELECT role FROM atlasez_project_memberships")
      ) {
        statement.first = async <T>() => ({ role: "member" }) as T;
      } else if (query.includes("FROM editorial_tasks WHERE id=?")) {
        statement.first = async <T>() =>
          ({
            project_id: "atlas",
            subject: null,
            assignee_email: "member@example.com",
            task_kind: "task",
            title: "確認タスク",
            created_by: "member@example.com",
            due_at: null,
            due_timezone: "Asia/Tokyo",
            status: "open",
            updated_at: "2026-09-28T00:00:00.000Z",
            archived_at: null,
          }) as T;
      } else if (query.includes("workflow_transition_events")) {
        statement.first = async <T>() => null as T | null;
      }
      if (
        query.includes("UPDATE editorial_tasks SET status=") ||
        query.includes("INSERT INTO workflow_transition_events") ||
        query.includes("INSERT INTO admin_audit_log")
      ) {
        sideEffectQueries.push(query);
      }
      return statement;
    };

    const response = await worker.fetch(
      loggedInApiRequest(
        "/api/admin/operations/tasks/123e4567-e89b-12d3-a456-426614174000",
        "PATCH",
        {
          status: "open",
          expectedUpdatedAt: "2026-09-28T00:00:00.000Z",
        },
      ),
      memberEnvironment as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, unchanged: true });
    expect(sideEffectQueries).toEqual([]);
  });

  it.each([
    ["task update", "update"],
    ["workflow event insert", "event"],
  ] as const)(
    "rolls back the task transition when the %s fails",
    async (_failureName, failurePoint) => {
      const state = {
        status: "open",
        updatedAt: "2026-09-28T00:00:00.000Z",
        events: [] as Array<{
          entity_id: string;
          from_state: string;
          to_state: string;
          actor_email: string;
          idempotency_key: string;
          created_at: string;
        }>,
      };
      const reports = {
        prepare(query: string) {
          const statement = new Statement(query);
          statement.first = async <T>() => {
            if (
              query.includes(
                "FROM workflow_transition_events WHERE actor_email=?",
              )
            ) {
              const [, idempotencyKey] = statement.boundValues;
              return (state.events.find(
                (event) => event.idempotency_key === idempotencyKey,
              ) ?? null) as T | null;
            }
            if (query.includes("FROM editorial_tasks WHERE id=?"))
              return {
                project_id: "atlas",
                subject: null,
                assignee_email: "task-admin@example.com",
                task_kind: "task",
                title: "Atomic task",
                created_by: "task-admin@example.com",
                status: state.status,
                updated_at: state.updatedAt,
                archived_at: null,
              } as T;
            if (
              query.includes("FROM atlasez_projects WHERE id = ? OR slug = ?")
            )
              return {
                id: "atlas",
                slug: "atlas",
                name: "Atlas",
                description: "",
              } as T;
            return null as T | null;
          };
          return statement;
        },
        async batch(statements: Statement[]) {
          const previous = {
            status: state.status,
            updatedAt: state.updatedAt,
            events: [...state.events],
          };
          const results: Array<{ meta: { changes: number } }> = [];
          let lastChanges = 0;
          try {
            for (const statement of statements) {
              if (
                statement.query.startsWith("UPDATE editorial_tasks SET status=")
              ) {
                if (failurePoint === "update")
                  throw new Error("injected task update failure");
                const [
                  toState,
                  updatedAt,
                  taskId,
                  fromState,
                  expectedUpdatedAt,
                ] = statement.boundValues;
                const changed =
                  taskId === "task-1" &&
                  state.status === fromState &&
                  state.updatedAt === expectedUpdatedAt;
                if (changed) {
                  state.status = String(toState);
                  state.updatedAt = String(updatedAt);
                }
                lastChanges = Number(changed);
                results.push({ meta: { changes: lastChanges } });
                continue;
              }
              if (
                statement.query.startsWith(
                  "INSERT INTO workflow_transition_events",
                )
              ) {
                if (failurePoint === "event")
                  throw new Error("injected workflow event failure");
                const [
                  ,
                  ,
                  entityId,
                  fromState,
                  toState,
                  actorEmail,
                  idempotencyKey,
                  ,
                  ,
                  createdAt,
                ] = statement.boundValues;
                if (lastChanges === 1)
                  state.events.push({
                    entity_id: String(entityId),
                    from_state: String(fromState),
                    to_state: String(toState),
                    actor_email: String(actorEmail),
                    idempotency_key: String(idempotencyKey),
                    created_at: String(createdAt),
                  });
                lastChanges = Number(lastChanges === 1);
                results.push({ meta: { changes: lastChanges } });
              }
            }
            return results;
          } catch (error) {
            state.status = previous.status;
            state.updatedAt = previous.updatedAt;
            state.events = previous.events;
            throw error;
          }
        },
      };
      const testEnv = {
        ADMIN_AUTH_MODE: "local",
        ADMIN_LOCAL_EMAIL: "task-admin@example.com",
        REPORTS: reports,
        ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
      };
      const request = new Request(
        "http://localhost:8787/api/admin/workflow/transition",
        {
          method: "POST",
          headers: {
            origin: "http://localhost:8787",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            entityType: "task",
            entityId: "task-1",
            fromState: "open",
            toState: "doing",
            expectedUpdatedAt: "2026-09-28T00:00:00.000Z",
            idempotencyKey: "atomic-transition-1",
          }),
        },
      );

      const response = await worker.fetch(request, testEnv as never);

      expect(response.status).toBe(500);
      expect(state).toMatchObject({
        status: "open",
        updatedAt: "2026-09-28T00:00:00.000Z",
        events: [],
      });
    },
  );

  it("commits one task event and idempotency outcome with the state transition", async () => {
    const state = {
      status: "open",
      updatedAt: "2026-09-28T00:00:00.000Z",
      events: [] as Array<{
        entity_type: string;
        entity_id: string;
        from_state: string;
        to_state: string;
        actor_email: string;
        idempotency_key: string;
        created_at: string;
      }>,
    };
    const reports = {
      prepare(query: string) {
        const statement = new Statement(query);
        statement.first = async <T>() => {
          if (
            query.includes(
              "FROM workflow_transition_events WHERE actor_email=?",
            )
          ) {
            const [, idempotencyKey] = statement.boundValues;
            return (state.events.find(
              (event) => event.idempotency_key === idempotencyKey,
            ) ?? null) as T | null;
          }
          if (query.includes("FROM editorial_tasks WHERE id=?"))
            return {
              project_id: "atlas",
              subject: null,
              assignee_email: "task-admin@example.com",
              task_kind: "task",
              title: "Atomic task",
              created_by: "task-admin@example.com",
              status: state.status,
              updated_at: state.updatedAt,
              archived_at: null,
            } as T;
          if (query.includes("FROM atlasez_projects WHERE id = ? OR slug = ?"))
            return {
              id: "atlas",
              slug: "atlas",
              name: "Atlas",
              description: "",
            } as T;
          return null as T | null;
        };
        return statement;
      },
      async batch(statements: Statement[]) {
        const results: Array<{ meta: { changes: number } }> = [];
        let lastChanges = 0;
        for (const statement of statements) {
          if (
            statement.query.startsWith("UPDATE editorial_tasks SET status=")
          ) {
            const [toState, updatedAt, taskId, fromState, expectedUpdatedAt] =
              statement.boundValues;
            const changed =
              taskId === "task-1" &&
              state.status === fromState &&
              state.updatedAt === expectedUpdatedAt;
            if (changed) {
              state.status = String(toState);
              state.updatedAt = String(updatedAt);
            }
            lastChanges = Number(changed);
            results.push({ meta: { changes: lastChanges } });
            continue;
          }
          if (
            statement.query.startsWith("INSERT INTO workflow_transition_events")
          ) {
            const [
              ,
              entityType,
              entityId,
              fromState,
              toState,
              actorEmail,
              idempotencyKey,
              ,
              ,
              createdAt,
            ] = statement.boundValues;
            if (lastChanges === 1)
              state.events.push({
                entity_type: String(entityType),
                entity_id: String(entityId),
                from_state: String(fromState),
                to_state: String(toState),
                actor_email: String(actorEmail),
                idempotency_key: String(idempotencyKey),
                created_at: String(createdAt),
              });
            lastChanges = Number(lastChanges === 1);
            results.push({ meta: { changes: lastChanges } });
          }
        }
        return results;
      },
    };
    const testEnv = {
      ADMIN_AUTH_MODE: "local",
      ADMIN_LOCAL_EMAIL: "task-admin@example.com",
      REPORTS: reports,
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    };
    const transitionRequest = () =>
      new Request("http://localhost:8787/api/admin/workflow/transition", {
        method: "POST",
        headers: {
          origin: "http://localhost:8787",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          entityType: "task",
          entityId: "task-1",
          fromState: "open",
          toState: "doing",
          expectedUpdatedAt: "2026-09-28T00:00:00.000Z",
          idempotencyKey: "atomic-transition-1",
        }),
      });

    const firstResponse = await worker.fetch(
      transitionRequest(),
      testEnv as never,
    );
    const replayResponse = await worker.fetch(
      transitionRequest(),
      testEnv as never,
    );

    expect(firstResponse.status).toBe(200);
    expect(await firstResponse.json()).toMatchObject({
      ok: true,
      replayed: false,
    });
    expect(replayResponse.status).toBe(200);
    expect(await replayResponse.json()).toMatchObject({
      ok: true,
      replayed: true,
    });
    expect(state.status).toBe("doing");
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({
      entity_id: "task-1",
      from_state: "open",
      to_state: "doing",
      actor_email: "task-admin@example.com",
      idempotency_key: "atomic-transition-1",
    });
  });

  it("marks every currently unread notification candidate for the signed-in member", async () => {
    const memberEnvironment = stageEnv("accepted", false, true);
    const insertedReadValues: unknown[][] = [];
    const prepare = memberEnvironment.REPORTS.prepare;
    memberEnvironment.REPORTS.prepare = (query: string) => {
      const statement = prepare(query);
      if (query.includes("d.created_by = ? AND c.created_by != ?")) {
        statement.all = async <T>() => ({
          results: query.includes("AS notification_id")
            ? ([
                { notification_id: "comment-unread123" },
                { notification_id: "comment-unread456" },
              ] as T[])
            : ([
                {
                  id: "unread123",
                  __notification_id: "comment-unread123",
                  __notification_read: 0,
                  body: "First notification",
                  parent_comment_id: null,
                  created_at: "2026-08-22T00:00:00.000Z",
                  document_id: "document-1",
                  title: "First article",
                },
                {
                  id: "unread456",
                  __notification_id: "comment-unread456",
                  __notification_read: 0,
                  body: "Second notification",
                  parent_comment_id: null,
                  created_at: "2026-08-21T00:00:00.000Z",
                  document_id: "document-2",
                  title: "Second article",
                },
              ] as T[]),
        });
        statement.first = async <T>() => ({ total: 2, unread: 2 }) as T;
      }
      if (query.startsWith("INSERT INTO admin_notification_reads")) {
        statement.bind = (...values: unknown[]) => {
          const notificationIds = JSON.parse(String(values[2])) as string[];
          for (const id of notificationIds) {
            insertedReadValues.push([values[0], id, values[1]]);
          }
          return statement;
        };
      }
      return statement;
    };

    const secondPage = await worker.fetch(
      loggedInRequest("/api/admin/notifications?limit=1&offset=1"),
      memberEnvironment as never,
    );
    expect(secondPage.status).toBe(200);
    expect(await secondPage.json()).toMatchObject({
      notifications: [{ id: "comment-unread456", read: false }],
      unreadNotificationsCount: 2,
      totalNotifications: 2,
      nextOffset: null,
    });

    const unreadPage = await worker.fetch(
      loggedInRequest("/api/admin/notifications?limit=1&unreadOnly=true"),
      memberEnvironment as never,
    );
    expect(await unreadPage.json()).toMatchObject({
      notifications: [{ id: "comment-unread123", read: false }],
      totalNotifications: 2,
      nextOffset: 1,
    });

    const response = await worker.fetch(
      loggedInJsonRequest("/api/admin/notifications/read", { all: true }),
      memberEnvironment as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, markedCount: 2 });
    expect(insertedReadValues).toEqual([
      ["applicant@example.com", "comment-unread123", expect.any(String)],
      ["applicant@example.com", "comment-unread456", expect.any(String)],
    ]);
  });

  it("surfaces legacy reminder normalization and blocks incomplete mark-all", async () => {
    const memberEnvironment = stageEnv("accepted", false, true);
    const prepare = memberEnvironment.REPORTS.prepare;
    const reminderQueries: string[] = [];
    let writes = 0;
    memberEnvironment.REPORTS.batch = async () => {
      writes++;
      return [];
    };
    memberEnvironment.REPORTS.prepare = (query: string) => {
      const statement = prepare(query);
      if (
        query.includes("FROM editorial_task_reminders r JOIN editorial_tasks t")
      ) {
        reminderQueries.push(query);
        statement.first = async <T>() =>
          query.includes("SELECT 1 AS pending") ? ({ pending: 1 } as T) : null;
      }
      return statement;
    };

    const response = await worker.fetch(
      loggedInRequest("/api/admin/notifications?limit=20"),
      memberEnvironment as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      notifications: [],
      totalNotifications: 0,
      unreadNotificationsCount: 0,
      legacyReminderNormalizationPending: true,
    });
    expect(reminderQueries.some((query) => query.includes("LIMIT 1"))).toBe(
      true,
    );
    expect(
      reminderQueries.some(
        (query) =>
          query.includes("SELECT s.*") &&
          query.includes("remind_at_utc IS NULL"),
      ),
    ).toBe(false);

    const markAllResponse = await worker.fetch(
      loggedInJsonRequest("/api/admin/notifications/read", { all: true }),
      memberEnvironment as never,
    );

    expect(markAllResponse.status).toBe(409);
    expect(await markAllResponse.json()).toMatchObject({
      error:
        "古いタスクリマインダーを準備中です。時間をおいてから一括既読を再試行してください。",
    });
    expect(writes).toBe(0);
  });

  it("counts every SQL notification candidate and marks all unread rows beyond 500", async () => {
    const memberEnvironment = stageEnv("accepted", false, true);
    const notificationDb = new DatabaseSync(":memory:");
    notificationDb.exec(`
      CREATE TABLE editorial_documents (id TEXT PRIMARY KEY, title TEXT, created_by TEXT);
      CREATE TABLE editorial_comments (
        id TEXT PRIMARY KEY,
        body TEXT,
        parent_comment_id TEXT,
        created_at TEXT,
        document_id TEXT,
        created_by TEXT
      );
      CREATE TABLE admin_notification_reads (
        email TEXT,
        notification_id TEXT,
        read_at TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (email, notification_id)
      );
    `);
    const insertDocument = notificationDb.prepare(
      "INSERT INTO editorial_documents (id, title, created_by) VALUES (?, ?, ?)",
    );
    const insertComment = notificationDb.prepare(
      "INSERT INTO editorial_comments (id, body, parent_comment_id, created_at, document_id, created_by) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const candidateCount = 10_605;
    for (let index = 0; index < candidateCount; index++) {
      const id = `unread${String(index).padStart(4, "0")}`;
      const documentId = `document-${index}`;
      insertDocument.run(
        documentId,
        `Article ${index}`,
        "applicant@example.com",
      );
      insertComment.run(
        id,
        `Notification ${index}`,
        null,
        new Date(Date.UTC(2026, 0, 1) - index * 1_000).toISOString(),
        documentId,
        "commenter@example.com",
      );
    }
    const readNotificationIds = new Set<string>();
    const insertRead = notificationDb.prepare(
      "INSERT INTO admin_notification_reads (email, notification_id) VALUES (?, ?)",
    );
    for (let index = 0; index < 216; index++) {
      const id = `comment-unread${String(index).padStart(4, "0")}`;
      insertRead.run("applicant@example.com", id);
      readNotificationIds.add(id);
    }
    const insertedNotificationIds: string[] = [];
    const insertStatementQueries: string[] = [];
    const notificationReadBatchSizes: number[] = [];
    memberEnvironment.REPORTS.batch = async (statements: Statement[] = []) => {
      notificationReadBatchSizes.push(statements.length);
      for (const statement of statements) await statement.run();
      return [];
    };
    const notificationCandidateQueries: string[] = [];
    const prepare = memberEnvironment.REPORTS.prepare;
    memberEnvironment.REPORTS.prepare = (query: string) => {
      const statement = prepare(query);
      if (query.includes("d.created_by = ? AND c.created_by != ?")) {
        notificationCandidateQueries.push(query);
        statement.all = async <T>() => {
          return {
            results: notificationDb
              .prepare(query)
              .all(
                ...(statement.boundValues as (
                  string | number | bigint | null | Uint8Array
                )[]),
              ) as T[],
          };
        };
        statement.first = async <T>() =>
          notificationDb
            .prepare(query)
            .get(
              ...(statement.boundValues as (
                string | number | bigint | null | Uint8Array
              )[]),
            ) as T;
      }
      return statement;
    };

    const response = await worker.fetch(
      loggedInRequest("/api/admin/notifications?limit=100"),
      memberEnvironment as never,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      notifications: Array<{ id: string; read: boolean }>;
      totalNotifications: number;
      unreadNotificationsCount: number;
    };
    expect(data.notifications).toHaveLength(100);
    expect(data.totalNotifications).toBe(candidateCount);
    expect(data.unreadNotificationsCount).toBe(10_389);
    expect(
      notificationCandidateQueries.some((query) => /\bLIMIT\s+\?/i.test(query)),
    ).toBe(true);
    expect(
      notificationCandidateQueries.some((query) =>
        query.includes("COUNT(*) AS total"),
      ),
    ).toBe(true);
    expect(
      data.notifications.every(
        (notification) =>
          readNotificationIds.has(notification.id) === notification.read,
      ),
    ).toBe(true);
    expect(notificationCandidateQueries).not.toHaveLength(0);
    expect(readNotificationIds.size).toBe(216);

    const deepCursor = btoa(
      JSON.stringify({
        updatedAt: new Date(
          Date.UTC(2026, 0, 1) - 10_000 * 1_000,
        ).toISOString(),
        id: "comment-unread10000",
      }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    const deepPageResponse = await worker.fetch(
      loggedInRequest(
        `/api/admin/notifications?limit=100&cursor=${deepCursor}`,
      ),
      memberEnvironment as never,
    );
    expect(deepPageResponse.status).toBe(200);
    const deepPageData = (await deepPageResponse.json()) as {
      notifications: Array<{ id: string }>;
      totalNotifications: number;
      nextCursor: string | null;
    };
    expect(deepPageData.notifications).toHaveLength(100);
    expect(deepPageData.notifications[0]?.id).toBe("comment-unread10001");
    expect(deepPageData.totalNotifications).toBe(candidateCount);
    expect(deepPageData.nextCursor).toEqual(expect.any(String));

    const unsupportedOffset = await worker.fetch(
      loggedInRequest("/api/admin/notifications?limit=100&offset=10001"),
      memberEnvironment as never,
    );
    expect(unsupportedOffset.status).toBe(400);

    const originalPrepare = memberEnvironment.REPORTS.prepare;
    memberEnvironment.REPORTS.prepare = (query: string) => {
      const statement = originalPrepare(query);
      if (query.startsWith("INSERT INTO admin_notification_reads")) {
        insertStatementQueries.push(query);
        statement.bind = (...values: unknown[]) => {
          statement.boundValues = values;
          insertedNotificationIds.push(
            ...(JSON.parse(String(values[2])) as string[]),
          );
          return statement;
        };
        statement.run = async () => {
          const result = notificationDb
            .prepare(query)
            .run(
              ...(statement.boundValues as (
                string | number | bigint | null | Uint8Array
              )[]),
            );
          return { meta: { changes: Number(result.changes) } };
        };
      }
      return statement;
    };
    const markAllResponse = await worker.fetch(
      loggedInJsonRequest("/api/admin/notifications/read", { all: true }),
      memberEnvironment as never,
    );
    expect(markAllResponse.status).toBe(200);
    expect(await markAllResponse.json()).toMatchObject({
      ok: true,
      markedCount: 10_389,
    });
    expect(insertStatementQueries).toHaveLength(21);
    expect(
      insertStatementQueries.every(
        (query) =>
          query.includes("json_each(?)") &&
          (query.match(/\?/g) ?? []).length === 3,
      ),
    ).toBe(true);
    expect(notificationReadBatchSizes).toEqual([
      ...Array<number>(10).fill(2),
      1,
    ]);
    expect(insertedNotificationIds).toHaveLength(10_389);
    expect(insertedNotificationIds).toEqual(
      Array.from(
        { length: candidateCount },
        (_, index) => `comment-unread${String(index).padStart(4, "0")}`,
      ).filter((id) => !readNotificationIds.has(id)),
    );
    expect(
      notificationDb
        .prepare(
          "SELECT notification_id FROM admin_notification_reads WHERE email = ? ORDER BY notification_id",
        )
        .all("applicant@example.com")
        .map((row) => (row as { notification_id: string }).notification_id),
    ).toEqual(
      Array.from(
        { length: candidateCount },
        (_, index) => `comment-unread${String(index).padStart(4, "0")}`,
      ).sort(),
    );
    notificationDb.close();
  }, 15_000);

  it("keeps the application directory open for an existing member", async () => {
    const applicationPage = await worker.fetch(
      loggedInRequest("/apply/"),
      stageEnv("accepted", false, true, true) as never,
    );
    expect(applicationPage.status).toBe(200);
  });

  it("routes an accepted member entering at the site root to the member portal", async () => {
    const rootPage = await worker.fetch(
      loggedInRequest("/"),
      stageEnv("accepted", false, true, true) as never,
    );
    expect(rootPage.status).toBe(302);
    expect(rootPage.headers.get("location")).toBe(
      "https://admin.example/admin/portal/",
    );
  });

  it("keeps the application directory open for an administrator", async () => {
    const applicationPage = await worker.fetch(
      loggedInRequest("/apply/"),
      stageEnv(null, true) as never,
    );
    expect(applicationPage.status).toBe(200);
  });

  it("routes accepted users to onboarding before member features", async () => {
    const applicantPage = await worker.fetch(
      loggedInRequest("/applicant/"),
      stageEnv("accepted") as never,
    );
    expect(applicantPage.status).toBe(302);
    expect(applicantPage.headers.get("location")).toBe(
      "https://admin.example/onboarding/",
    );

    const onboardingPage = await worker.fetch(
      loggedInRequest("/onboarding/"),
      stageEnv("accepted") as never,
    );
    expect(onboardingPage.status).toBe(200);
  });

  it("starts member features after profile setup without showing the tutorial", async () => {
    const onboardingPage = await worker.fetch(
      loggedInRequest("/onboarding/"),
      stageEnv("accepted", false, true) as never,
    );
    expect(onboardingPage.status).toBe(302);
    expect(onboardingPage.headers.get("location")).toBe(
      "https://admin.example/admin/portal/",
    );

    const tutorialPage = await worker.fetch(
      loggedInRequest("/onboarding/tutorial/"),
      stageEnv("accepted", false, true) as never,
    );
    expect(tutorialPage.status).toBe(302);
    expect(tutorialPage.headers.get("location")).toBe(
      "https://admin.example/admin/portal/",
    );

    const memberPage = await worker.fetch(
      loggedInRequest("/admin/portal/"),
      stageEnv("accepted", false, true) as never,
    );
    expect(memberPage.status).toBe(200);
  });

  it("opens project setup and the member profile after basic profile setup", async () => {
    const setupEnv = stageEnv(
      "accepted",
      false,
      true,
      false,
      false,
      0,
      false,
      false,
    );
    const root = await worker.fetch(
      loggedInRequest("/onboarding/"),
      setupEnv as never,
    );
    expect(root.status).toBe(302);
    expect(root.headers.get("location")).toBe(
      "https://admin.example/onboarding/project/",
    );

    const project = await worker.fetch(
      loggedInRequest("/onboarding/project/"),
      setupEnv as never,
    );
    expect(project.status).toBe(200);

    const profile = await worker.fetch(
      loggedInRequest("/admin/member-profile/"),
      setupEnv as never,
    );
    expect(profile.status).toBe(200);
  });

  it("keeps tutorial APIs out of the acceptance flow", async () => {
    const response = await worker.fetch(
      loggedInRequest("/api/onboarding/tutorial"),
      stageEnv("accepted", false, true) as never,
    );
    expect(response.status).toBe(403);

    const practice = await worker.fetch(
      loggedInJsonRequest("/api/onboarding/atlas-writing-practice", {
        action: "save-draft",
        title: "練習記事",
        body: "## 見出し\n\n**本文**と $x^2$ を含みます。",
      }),
      stageEnv("accepted", false, true) as never,
    );
    expect(practice.status).toBe(403);
  });

  it("limits the onboarding demo to global internal-operations managers", async () => {
    const preview = await worker.fetch(
      loggedInRequest("/admin/onboarding-demo/"),
      stageEnv("accepted", true, false, false, true) as never,
    );
    expect(preview.status).toBe(200);

    const nonManagerPreview = await worker.fetch(
      loggedInRequest("/admin/onboarding-demo/"),
      stageEnv("accepted", true) as never,
    );
    expect(nonManagerPreview.status).toBe(403);
  });

  it("returns an applicant's own Google account and application summary", async () => {
    const response = await worker.fetch(
      loggedInRequest("/api/applicant/me"),
      stageEnv("new") as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      email: "applicant@example.com",
      application: {
        project: "学習サイト「アトラス」",
        status: "new",
      },
    });
  });
});
