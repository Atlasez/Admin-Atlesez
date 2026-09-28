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
    expect(eventQuery?.boundValues).toEqual(["secretariat", "mathematics"]);
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

  it("marks every currently unread notification candidate for the signed-in member", async () => {
    const memberEnvironment = stageEnv("accepted", false, true);
    const insertedReadValues: unknown[][] = [];
    const prepare = memberEnvironment.REPORTS.prepare;
    memberEnvironment.REPORTS.prepare = (query: string) => {
      const statement = prepare(query);
      if (query.includes("WHERE d.created_by = ? AND c.created_by != ?")) {
        statement.all = async <T>() => ({
          results: [
            {
              id: "unread123",
              body: "First notification",
              parent_comment_id: null,
              created_at: "2026-08-22T00:00:00.000Z",
              document_id: "document-1",
              title: "First article",
            },
            {
              id: "unread456",
              body: "Second notification",
              parent_comment_id: null,
              created_at: "2026-08-21T00:00:00.000Z",
              document_id: "document-2",
              title: "Second article",
            },
          ] as T[],
        });
      }
      if (query.startsWith("INSERT INTO admin_notification_reads")) {
        statement.bind = (...values: unknown[]) => {
          insertedReadValues.push(values);
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

  it("keeps notification read-state queries within D1's 100-bind limit", async () => {
    const memberEnvironment = stageEnv("accepted", false, true);
    const readStateQueries: Array<{ query: string; values: unknown[] }> = [];
    const readNotificationIds = new Set<string>();
    const prepare = memberEnvironment.REPORTS.prepare;
    memberEnvironment.REPORTS.prepare = (query: string) => {
      const statement = prepare(query);
      if (query.includes("WHERE d.created_by = ? AND c.created_by != ?")) {
        statement.all = async <T>() => ({
          results: Array.from({ length: 205 }, (_, index) => ({
            id: `unread${String(index).padStart(4, "0")}`,
            body: `Notification ${index}`,
            parent_comment_id: null,
            created_at: `2026-08-${String(22 - Math.floor(index / 24)).padStart(2, "0")}T00:00:00.000Z`,
            document_id: `document-${index}`,
            title: `Article ${index}`,
          })) as T[],
        });
      }
      if (
        query.startsWith("SELECT notification_id FROM admin_notification_reads")
      ) {
        statement.all = async <T>() => {
          const batchIds = statement.boundValues.slice(1) as string[];
          const selectedReadIds = [batchIds[0], batchIds.at(-1)].filter(
            (id): id is string => Boolean(id),
          );
          selectedReadIds.forEach((id) => readNotificationIds.add(id));
          readStateQueries.push({
            query,
            values: [...statement.boundValues],
          });
          return {
            results: selectedReadIds.map((notification_id) => ({
              notification_id,
            })) as T[],
          };
        };
      }
      return statement;
    };

    const response = await worker.fetch(
      loggedInRequest(
        "/api/admin/notifications?limit=100&includeUnreadIds=true",
      ),
      memberEnvironment as never,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      notifications: Array<{ id: string; read: boolean }>;
      unreadNotificationsCount: number;
      unreadNotificationIds: string[];
    };
    expect(data.notifications).toHaveLength(100);
    expect(data.unreadNotificationsCount).toBe(199);
    expect(data.unreadNotificationIds).toHaveLength(199);
    expect(
      data.notifications.every(
        (notification) =>
          readNotificationIds.has(notification.id) === notification.read,
      ),
    ).toBe(true);
    expect(
      data.unreadNotificationIds.every((id) => !readNotificationIds.has(id)),
    ).toBe(true);
    expect(readStateQueries).toHaveLength(3);
    expect(readStateQueries.map(({ values }) => values.length)).toEqual([
      100, 100, 8,
    ]);
    expect(
      readStateQueries.every(
        ({ values }) => values[0] === "applicant@example.com",
      ),
    ).toBe(true);
    expect(
      readStateQueries.every(
        ({ query, values }) =>
          (query.match(/\?/g) ?? []).length === values.length &&
          values.length <= 100,
      ),
    ).toBe(true);
  });

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
