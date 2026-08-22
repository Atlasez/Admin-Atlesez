import { describe, expect, it } from "vitest";
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
  ...extra,
  REPORTS: {
    prepare: (query: string) => new Statement(query),
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
