import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/admin-worker";

class Statement {
  private readonly query: string;

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

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
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

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      provisioning: { status: "failed", applied: 0 },
    });
    expect(
      requests.some(
        ({ url, method }) => url.includes("/roles/") && method === "PUT",
      ),
    ).toBe(false);
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
