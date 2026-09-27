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

describe("Google OAuth login callback", () => {
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
