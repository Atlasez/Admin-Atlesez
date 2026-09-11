import { describe, expect, it, vi } from "vitest";
import worker from "../../src/admin-worker";

class Statement {
  constructor(_query: string) {}
  bind() {
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
    expect(memberPage.status).toBe(302);
    expect(memberPage.headers.get("location")).toBe(
      "https://admin.example/admin/portal/",
    );
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
