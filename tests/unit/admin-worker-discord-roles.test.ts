import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { syncDiscordRolesToAdmin } from "../../src/admin-worker";

class Statement {
  protected readonly query: string;

  constructor(query: string) {
    this.query = query;
  }

  bind(..._args: unknown[]) {
    return this;
  }

  async run() {
    return { meta: { changes: 1 } };
  }

  async first<T>() {
    if (this.query.includes("editorial_member_profiles"))
      return {
        university: "",
        year: "",
        interests: "",
        affiliation_type: "",
      } as T;
    if (this.query.includes("atlasez_member_discord_accounts"))
      return {
        discord_user_id: "123456789012345678",
        access_token_ciphertext: "",
        refresh_token_ciphertext: "",
        token_expires_at: null,
      } as T;
    return null as T | null;
  }

  async all<T>() {
    if (this.query.includes("report_admin_permissions"))
      return { results: [{ subject: "mathematics" }] as T[] };
    if (this.query.includes("atlasez_discord_role_mappings"))
      return {
        results: [
          { discord_role_id: "role-mathematics" },
          { discord_role_id: "role-stale" },
        ] as T[],
      };
    return { results: [] as T[] };
  }
}

const fetchSpy = vi.spyOn(globalThis, "fetch");

afterEach(() => {
  fetchSpy.mockReset();
});

describe("Discord managed role synchronization", () => {
  it("removes a mapped role that is no longer selected", async () => {
    const requests: Array<{ url: string; method: string }> = [];
    fetchSpy.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({ url, method });
      if (url.endsWith("/guilds/guild-1"))
        return Response.json({ name: "Atlasez学習サイト運営" });
      if (url.endsWith("/members/123456789012345678"))
        return Response.json({
          roles: [
            "@everyone",
            "role-mathematics",
            "role-stale",
            "role-managed",
          ],
        });
      if (url.endsWith("/roles"))
        return Response.json([
          { id: "role-mathematics", name: "数学" },
          { id: "role-stale", name: "物理" },
          { id: "role-managed", name: "外部連携", managed: true },
        ]);
      if (method === "DELETE") return new Response(null, { status: 204 });
      throw new Error(`Unexpected Discord request: ${method} ${url}`);
    });

    const env = {
      ADMIN_AUTH_MODE: "local",
      ADMIN_LOCAL_EMAIL: "manager@example.com",
      DISCORD_BOT_TOKEN: "test-token",
      DISCORD_GUILD_ID: "guild-1",
      DISCORD_GUILD_NAME: "Atlasez学習サイト運営",
      REPORTS: {
        prepare: (query: string) => new Statement(query),
        batch: async () => [],
      },
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    };
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/member-attributes", {
        method: "PUT",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "member@example.com",
          university: "",
          year: "",
          interests: ["数学"],
        }),
      }),
      env as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      provisioning: { status: "synced", applied: 0, removed: 1, warnings: [] },
    });
    expect(
      requests.some(
        ({ url, method }) =>
          url.endsWith("/roles/role-stale") && method === "DELETE",
      ),
    ).toBe(true);
    expect(
      requests.some(
        ({ url, method }) =>
          url.endsWith("/roles/role-mathematics") && method === "DELETE",
      ),
    ).toBe(false);
    expect(
      requests.some(({ url }) => url.endsWith("/roles/role-managed")),
    ).toBe(false);
  });

  it("does not fall back to a managed role with the same display name", async () => {
    class ManagedRoleStatement {
      constructor(private readonly query: string) {}

      bind(..._args: unknown[]) {
        return this;
      }

      async run() {
        return { meta: { changes: 1 } };
      }

      async first<T>() {
        if (this.query.includes("editorial_member_profiles"))
          return {
            university: "",
            year: "",
            interests: "",
            affiliation_type: "",
          } as T;
        if (this.query.includes("atlasez_member_discord_accounts"))
          return {
            discord_user_id: "123456789012345678",
            access_token_ciphertext: "",
            refresh_token_ciphertext: "",
            token_expires_at: null,
          } as T;
        return null as T | null;
      }

      async all<T>() {
        if (this.query.includes("report_admin_permissions"))
          return { results: [{ subject: "mathematics" }] as T[] };
        return { results: [] as T[] };
      }
    }

    const requests: Array<{ url: string; method: string }> = [];
    fetchSpy.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({ url, method });
      if (url.endsWith("/guilds/guild-1"))
        return Response.json({ name: "Atlasez学習サイト運営" });
      if (url.endsWith("/members/123456789012345678"))
        return Response.json({ roles: ["@everyone"] });
      if (url.endsWith("/roles"))
        return Response.json([
          { id: "role-mathematics", name: "数学", managed: true },
        ]);
      throw new Error(`Unexpected Discord request: ${method} ${url}`);
    });

    const env = {
      ADMIN_AUTH_MODE: "local",
      ADMIN_LOCAL_EMAIL: "manager@example.com",
      DISCORD_BOT_TOKEN: "test-token",
      DISCORD_GUILD_ID: "guild-1",
      DISCORD_GUILD_NAME: "Atlasez学習サイト運営",
      REPORTS: {
        prepare: (query: string) => new ManagedRoleStatement(query),
        batch: async () => [],
      },
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    };
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/member-attributes", {
        method: "PUT",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "member@example.com",
          university: "",
          year: "",
          interests: [],
        }),
      }),
      env as never,
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      provisioning: { status: "failed", applied: 0 },
    });
    expect(
      requests.some(
        ({ url, method }) =>
          url.endsWith("/roles/role-mathematics") && method === "PUT",
      ),
    ).toBe(false);
  });

  it("does not choose arbitrarily when assignable roles share a name", async () => {
    class DuplicateRoleStatement {
      constructor(private readonly query: string) {}

      bind(..._args: unknown[]) {
        return this;
      }

      async run() {
        return { meta: { changes: 1 } };
      }

      async first<T>() {
        if (this.query.includes("editorial_member_profiles"))
          return {
            university: "",
            year: "",
            interests: "",
            affiliation_type: "",
          } as T;
        if (this.query.includes("atlasez_member_discord_accounts"))
          return {
            discord_user_id: "123456789012345678",
            access_token_ciphertext: "",
            refresh_token_ciphertext: "",
            token_expires_at: null,
          } as T;
        return null as T | null;
      }

      async all<T>() {
        if (this.query.includes("report_admin_permissions"))
          return { results: [{ subject: "mathematics" }] as T[] };
        return { results: [] as T[] };
      }
    }

    const requests: Array<{ url: string; method: string }> = [];
    fetchSpy.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({ url, method });
      if (url.endsWith("/guilds/guild-1"))
        return Response.json({ name: "Atlasez学習サイト運営" });
      if (url.endsWith("/members/123456789012345678"))
        return Response.json({ roles: ["@everyone"] });
      if (url.endsWith("/roles"))
        return Response.json([
          { id: "role-mathematics-a", name: "数学" },
          { id: "role-mathematics-b", name: "数学" },
        ]);
      throw new Error(`Unexpected Discord request: ${method} ${url}`);
    });

    const env = {
      ADMIN_AUTH_MODE: "local",
      ADMIN_LOCAL_EMAIL: "manager@example.com",
      DISCORD_BOT_TOKEN: "test-token",
      DISCORD_GUILD_ID: "guild-1",
      DISCORD_GUILD_NAME: "Atlasez学習サイト運営",
      REPORTS: {
        prepare: (query: string) => new DuplicateRoleStatement(query),
        batch: async () => [],
      },
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    };
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/member-attributes", {
        method: "PUT",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "member@example.com",
          university: "",
          year: "",
          interests: [],
        }),
      }),
      env as never,
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      provisioning: { status: "failed", applied: 0 },
    });
    expect(
      requests.some(
        ({ url, method }) => url.includes("/roles/") && method === "PUT",
      ),
    ).toBe(false);
  });

  it("skips legacy affiliation values instead of treating them as Discord roles", async () => {
    class LegacyProfileStatement extends Statement {
      async first<T>() {
        if (this.query.includes("editorial_member_profiles"))
          return {
            university: "",
            year: "",
            interests: "",
            affiliation_type: "student",
          } as T;
        return super.first<T>();
      }

      async all<T>() {
        return { results: [] as T[] };
      }
    }

    const requests: Array<{ url: string; method: string }> = [];
    fetchSpy.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({ url, method });
      if (url.endsWith("/guilds/guild-1"))
        return Response.json({ name: "Atlasez学習サイト運営" });
      if (url.endsWith("/members/123456789012345678"))
        return Response.json({ roles: ["@everyone"] });
      if (url.endsWith("/roles")) return Response.json([]);
      throw new Error(`Unexpected Discord request: ${method} ${url}`);
    });

    const env = {
      ADMIN_AUTH_MODE: "local",
      ADMIN_LOCAL_EMAIL: "manager@example.com",
      DISCORD_BOT_TOKEN: "test-token",
      DISCORD_GUILD_ID: "guild-1",
      DISCORD_GUILD_NAME: "Atlasez学習サイト運営",
      REPORTS: {
        prepare: (query: string) => new LegacyProfileStatement(query),
        batch: async () => [],
      },
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    };
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/member-attributes", {
        method: "PUT",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "member@example.com",
          university: "",
          year: "",
          interests: [],
        }),
      }),
      env as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      provisioning: {
        status: "synced",
        warnings: [],
        notices: [
          "所属区分「student」はDiscordロール同期の対象外としてスキップしました。",
        ],
      },
    });
    expect(requests.some(({ url }) => url.includes("student"))).toBe(false);
  });

  it("reuses the existing 運営メンバー role for the global manager mapping", async () => {
    class ManagerStatement extends Statement {
      async all<T>() {
        if (this.query.includes("report_admin_permissions"))
          return { results: [{ subject: "*" }] as T[] };
        if (this.query.includes("atlasez_discord_role_mappings"))
          return { results: [] as T[] };
        return { results: [] as T[] };
      }
    }

    const requests: Array<{ url: string; method: string }> = [];
    fetchSpy.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({ url, method });
      if (url.endsWith("/guilds/guild-1"))
        return Response.json({ name: "Atlasez学習サイト運営" });
      if (url.endsWith("/members/123456789012345678"))
        return Response.json({ roles: ["@everyone"] });
      if (url.endsWith("/roles"))
        return Response.json([
          { id: "123456789012345678", name: "運営メンバー" },
        ]);
      if (method === "PUT") return new Response(null, { status: 204 });
      throw new Error(`Unexpected Discord request: ${method} ${url}`);
    });

    const env = {
      ADMIN_AUTH_MODE: "local",
      ADMIN_LOCAL_EMAIL: "manager@example.com",
      DISCORD_BOT_TOKEN: "test-token",
      DISCORD_GUILD_ID: "guild-1",
      DISCORD_GUILD_NAME: "Atlasez学習サイト運営",
      REPORTS: {
        prepare: (query: string) => new ManagerStatement(query),
        batch: async () => [],
      },
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    };
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/member-attributes", {
        method: "PUT",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "member@example.com",
          university: "",
          year: "",
          interests: [],
        }),
      }),
      env as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      provisioning: { status: "synced", applied: 1, warnings: [] },
    });
    expect(
      requests.some(
        ({ url, method }) =>
          url.endsWith("/roles/123456789012345678") && method === "PUT",
      ),
    ).toBe(true);
  });

  it("returns a visible failure when a manually selected role cannot be assigned", async () => {
    class ManualRoleStatement {
      constructor(private readonly query: string) {}

      bind(..._args: unknown[]) {
        return this;
      }

      async run() {
        return { meta: { changes: 1 } };
      }

      async first<T>() {
        if (this.query.includes("editorial_member_profiles"))
          return {
            university: "",
            year: "",
            interests: "",
            affiliation_type: "",
          } as T;
        if (this.query.includes("atlasez_member_discord_accounts"))
          return {
            discord_user_id: "123456789012345678",
            access_token_ciphertext: "",
            refresh_token_ciphertext: "",
            token_expires_at: null,
          } as T;
        return null as T | null;
      }

      async all<T>() {
        if (this.query.includes("atlasez_discord_role_catalog"))
          return {
            results: [
              { discord_role_id: "123456789012345678", is_managed: 0 },
            ] as T[],
          };
        if (this.query.includes("report_admin_permissions"))
          return { results: [] as T[] };
        if (this.query.includes("atlasez_member_discord_role_assignments"))
          return this.query.includes("is_active")
            ? {
                results: [
                  { discord_role_id: "123456789012345678", is_active: 1 },
                ] as T[],
              }
            : { results: [] as T[] };
        return { results: [] as T[] };
      }
    }

    const requests: Array<{ url: string; method: string }> = [];
    fetchSpy.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({ url, method });
      if (url.endsWith("/guilds/guild-1"))
        return Response.json({ name: "Atlasez学習サイト運営" });
      if (url.endsWith("/members/123456789012345678"))
        return Response.json({ roles: ["@everyone"] });
      if (url.endsWith("/roles"))
        return Response.json([
          { id: "123456789012345678", name: "場の量子論" },
        ]);
      if (method === "PUT" && url.includes("/roles/123456789012345678"))
        return new Response(null, { status: 403 });
      throw new Error(`Unexpected Discord request: ${method} ${url}`);
    });

    const env = {
      ADMIN_AUTH_MODE: "local",
      ADMIN_LOCAL_EMAIL: "manager@example.com",
      DISCORD_BOT_TOKEN: "test-token",
      DISCORD_GUILD_ID: "guild-1",
      DISCORD_GUILD_NAME: "Atlasez学習サイト運営",
      REPORTS: {
        prepare: (query: string) => new ManualRoleStatement(query),
        batch: async () => [],
      },
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    };
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/member-discord-roles", {
        method: "PUT",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "member@example.com",
          roleIds: ["123456789012345678"],
        }),
      }),
      env as never,
    );

    expect(response.status).toBe(502);
    const body = (await response.json()) as {
      ok: boolean;
      provisioning: { status: string; warnings: string[] };
    };
    expect(body.ok).toBe(false);
    expect(body.provisioning.status).toBe("failed");
    expect(body.provisioning.warnings[0]).toContain("場の量子論");
    expect(body.provisioning.warnings[0]).toContain("Botのロール");
    expect(
      requests.some(
        ({ url, method }) =>
          url.endsWith("/roles/123456789012345678") && method === "PUT",
      ),
    ).toBe(true);
  });

  it("does not persist the combined member settings when Discord sync fails", async () => {
    const writes: string[] = [];
    class AtomicSettingsStatement {
      constructor(private readonly query: string) {}

      bind(..._args: unknown[]) {
        return this;
      }

      async run() {
        writes.push(this.query);
        return { meta: { changes: 1 } };
      }

      async first<T>() {
        if (this.query.includes("editorial_member_profiles"))
          return {
            university: "",
            year: "",
            interests: "",
            affiliation_type: "",
          } as T;
        if (this.query.includes("atlasez_member_discord_accounts"))
          return {
            discord_user_id: "123456789012345678",
            access_token_ciphertext: "",
            refresh_token_ciphertext: "",
            token_expires_at: null,
          } as T;
        if (this.query.includes("atlasez_discord_role_mappings"))
          return { discord_role_id: "123456789012345678" } as T;
        return null as T | null;
      }

      async all<T>() {
        if (this.query.includes("atlasez_discord_role_catalog"))
          return {
            results: [
              { discord_role_id: "123456789012345678", is_managed: 0 },
            ] as T[],
          };
        if (this.query.includes("report_admin_permissions"))
          return { results: [] as T[] };
        if (this.query.includes("atlasez_member_discord_role_assignments"))
          return { results: [] as T[] };
        return { results: [] as T[] };
      }
    }

    fetchSpy.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/guilds/guild-1"))
        return Response.json({ name: "Atlasez学習サイト運営" });
      if (url.endsWith("/members/123456789012345678"))
        return Response.json({ roles: ["@everyone"] });
      if (url.endsWith("/roles"))
        return Response.json([{ id: "123456789012345678", name: "数学" }]);
      if (method === "PUT" && url.includes("/roles/123456789012345678"))
        return new Response(null, { status: 403 });
      throw new Error(`Unexpected Discord request: ${method} ${url}`);
    });

    const env = {
      ADMIN_AUTH_MODE: "local",
      ADMIN_LOCAL_EMAIL: "manager@example.com",
      DISCORD_BOT_TOKEN: "test-token",
      DISCORD_GUILD_ID: "guild-1",
      DISCORD_GUILD_NAME: "Atlasez学習サイト運営",
      REPORTS: {
        prepare: (query: string) => new AtomicSettingsStatement(query),
        batch: async (statements: Array<{ query?: string }>) => {
          writes.push(`batch:${statements.length}`);
          return [];
        },
      },
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    };
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/member-settings", {
        method: "PUT",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "member@example.com",
          subjects: ["mathematics"],
          roleIds: [],
          university: "",
          year: "",
          interests: [],
        }),
      }),
      env as never,
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("変更は保存していません"),
      provisioning: { status: "failed" },
    });
    expect(writes).toEqual([]);
  });

  it("reports Discord permission and hierarchy readiness without writing to Discord", async () => {
    class ReadinessStatement {
      constructor(private readonly query: string) {}

      bind(..._args: unknown[]) {
        return this;
      }

      async run() {
        return { meta: { changes: 0 } };
      }

      async first<T>() {
        return null as T | null;
      }

      async all<T>() {
        if (this.query.includes("atlasez_discord_role_mappings"))
          return { results: [{ discord_role_id: "role-math" }] as T[] };
        if (this.query.includes("atlasez_discord_attribute_role_mappings"))
          return { results: [] as T[] };
        if (this.query.includes("atlasez_member_discord_role_assignments"))
          return { results: [] as T[] };
        return { results: [] as T[] };
      }
    }

    const requests: Array<{ url: string; method: string }> = [];
    fetchSpy.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({ url, method });
      if (url.endsWith("/users/@me"))
        return Response.json({
          id: "999999999999999999",
          username: "Atlasez Bot",
        });
      if (url.endsWith("/guilds/guild-1"))
        return Response.json({ id: "guild-1", name: "Atlasez学習サイト運営" });
      if (url.endsWith("/roles"))
        return Response.json([
          {
            id: "bot-role",
            name: "Atlasez Bot",
            position: 100,
            managed: true,
            permissions: "268435456",
            tags: { bot_id: "999999999999999999" },
          },
          { id: "role-math", name: "数学", position: 10, permissions: "0" },
        ]);
      if (url.endsWith("/members/999999999999999999"))
        return Response.json({ roles: ["bot-role"] });
      throw new Error(`Unexpected Discord request: ${method} ${url}`);
    });

    const env = {
      ADMIN_AUTH_MODE: "local",
      ADMIN_LOCAL_EMAIL: "manager@example.com",
      DISCORD_BOT_TOKEN: "test-token",
      DISCORD_GUILD_ID: "guild-1",
      DISCORD_GUILD_NAME: "Atlasez学習サイト運営",
      DISCORD_OAUTH_CLIENT_ID: "client-id",
      DISCORD_OAUTH_CLIENT_SECRET: "client-secret",
      DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY: "encryption-key",
      RESEND_API_KEY: "resend-key",
      EMAIL_FROM: "Atlasez運営 <apply@atlasez.org>",
      REPORTS: {
        prepare: (query: string) => new ReadinessStatement(query),
        batch: async () => [],
      },
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    };
    const response = await worker.fetch(
      new Request("http://localhost/api/admin/discord-readiness", {
        headers: { origin: "http://localhost" },
      }),
      env as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ready: true,
      checks: {
        botApi: true,
        guildApi: true,
        rolesApi: true,
        botMember: true,
        manageRoles: true,
        roleHierarchy: true,
        roleMappings: true,
      },
      configured: { emailDelivery: true },
    });
    expect(requests.every(({ method }) => method === "GET")).toBe(true);
  });
});

describe("Discord to admin role synchronization", () => {
  type State = {
    roles: string[];
    permissions: Array<{ email: string; subject: string }>;
    profile: {
      email: string;
      university: string;
      year: string;
      interests: string;
      affiliation_type: string;
    } | null;
  };

  class InboundStatement {
    private args: unknown[] = [];

    constructor(
      private readonly query: string,
      private readonly state: State,
      private readonly writes: Array<{ query: string; args: unknown[] }>,
    ) {}

    bind(...args: unknown[]) {
      this.args = args;
      return this;
    }

    async run() {
      this.writes.push({ query: this.query, args: this.args });
      return { meta: { changes: 1 } };
    }

    async first<T>() {
      return null as T | null;
    }

    async all<T>() {
      if (this.query.includes("atlasez_member_discord_accounts"))
        return {
          results: [
            {
              email: "member@example.com",
              discord_user_id: "123456789012345678",
            },
          ] as T[],
        };
      if (this.query.includes("atlasez_discord_role_mappings"))
        return {
          results: [
            { subject: "mathematics", discord_role_id: "role-math" },
            { subject: "physics", discord_role_id: "role-physics" },
          ] as T[],
        };
      if (this.query.includes("atlasez_discord_attribute_role_mappings"))
        return {
          results: [
            {
              attribute_type: "university",
              attribute_value: "ZEN大学",
              discord_role_id: "role-zen",
            },
            {
              attribute_type: "year",
              attribute_value: "B2",
              discord_role_id: "role-b2",
            },
            {
              attribute_type: "interest",
              attribute_value: "数学",
              discord_role_id: "role-math",
            },
          ] as T[],
        };
      if (this.query.includes("report_admin_permissions"))
        return { results: this.state.permissions as T[] };
      if (this.query.includes("editorial_member_profiles"))
        return { results: this.state.profile ? [this.state.profile as T] : [] };
      return { results: [] as T[] };
    }
  }

  const makeEnv = (
    state: State,
    writes: Array<{ query: string; args: unknown[] }>,
  ) => ({
    DISCORD_BOT_TOKEN: "test-token",
    DISCORD_GUILD_ID: "guild-1",
    REPORTS: {
      prepare: (query: string) => new InboundStatement(query, state, writes),
      batch: async (statements: InboundStatement[]) => {
        for (const statement of statements) await statement.run();
        return [];
      },
    },
  });

  it("imports mapped Discord roles and ignores unknown roles", async () => {
    const state: State = {
      roles: ["role-math", "role-zen", "role-b2", "unknown-role"],
      permissions: [],
      profile: null,
    };
    const writes: Array<{ query: string; args: unknown[] }> = [];
    fetchSpy.mockResolvedValue(Response.json({ roles: state.roles }));

    await expect(
      syncDiscordRolesToAdmin(makeEnv(state, writes) as never),
    ).resolves.toMatchObject({
      accounts: 1,
      synced: 1,
      skipped: 0,
      updated: 1,
      warnings: [],
    });
    expect(
      writes.some(
        ({ query, args }) =>
          query.includes("INSERT OR IGNORE INTO report_admin_permissions") &&
          args.includes("mathematics"),
      ),
    ).toBe(true);
    expect(writes.some(({ query }) => query.includes("unknown-role"))).toBe(
      false,
    );
    expect(
      writes.some(
        ({ query, args }) =>
          query.includes("INSERT INTO editorial_member_profiles") &&
          args.includes("ZEN大学") &&
          args.includes("B2") &&
          args.includes("数学"),
      ),
    ).toBe(true);
  });

  it("removes only managed permissions and attributes when roles disappear", async () => {
    const state: State = {
      roles: ["unknown-role"],
      permissions: [{ email: "member@example.com", subject: "mathematics" }],
      profile: {
        email: "member@example.com",
        university: "ZEN大学",
        year: "B2",
        interests: "数学",
        affiliation_type: "",
      },
    };
    const writes: Array<{ query: string; args: unknown[] }> = [];
    fetchSpy.mockResolvedValue(Response.json({ roles: state.roles }));

    await expect(
      syncDiscordRolesToAdmin(makeEnv(state, writes) as never),
    ).resolves.toMatchObject({
      accounts: 1,
      synced: 1,
      skipped: 0,
      updated: 1,
      warnings: [],
    });
    expect(
      writes.some(
        ({ query, args }) =>
          query.includes("DELETE FROM report_admin_permissions") &&
          args.includes("mathematics"),
      ),
    ).toBe(true);
    expect(
      writes.some(
        ({ query, args }) =>
          query.includes("INSERT INTO editorial_member_profiles") &&
          args.includes("") &&
          args.includes(""),
      ),
    ).toBe(true);
  });
});
