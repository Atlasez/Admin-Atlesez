import { describe, expect, it, vi } from "vitest";
import worker from "../../src/admin-worker";
import { createAdminTestEnvironment } from "../helpers/admin-test-environment";

describe("ADMIN UI review prototype route", () => {
  it("requires developer-mode authorization for the page and every nested asset", async () => {
    const { db, env, request } = createAdminTestEnvironment();
    const assets = vi.spyOn(env.ASSETS, "fetch");
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO report_admin_permissions(email,subject) VALUES (?,'mathematics')",
    ).run("developer-scope@example.test");
    db.prepare(
      "INSERT INTO atlasez_project_memberships(project_id,email,role,joined_at) VALUES ('atlas',?,'manager',?)",
    ).run("developer-scope@example.test", now);
    db.prepare(
      "INSERT INTO report_admin_permissions(email,subject) VALUES (?,'mathematics')",
    ).run("regular-staff@example.test");

    for (const path of [
      "/admin/ui-review-prototype/",
      "/admin/ui-review-prototype/portal/after/",
      "/admin/ui-review-prototype/action-center/after/",
      "/admin/ui-review-prototype/_astro/review.css",
    ]) {
      const response = await request(path, "regular-staff@example.test");
      expect(response.status, path).toBe(403);
    }

    const page = await request(
      "/admin/ui-review-prototype/",
      "developer-scope@example.test",
    );
    const proposal = await request(
      "/admin/ui-review-prototype/portal/after/",
      "developer-scope@example.test",
    );
    const asset = await request(
      "/admin/ui-review-prototype/_astro/review.css",
      "developer-scope@example.test",
    );

    expect(page.status).toBe(200);
    expect(proposal.status).toBe(200);
    expect(asset.status).toBe(200);
    expect(page.headers.get("cache-control")).toContain("no-store");
    expect(assets).toHaveBeenCalledTimes(3);
  });

  it("does not serve the prototype before authentication", async () => {
    const { env } = createAdminTestEnvironment();
    const assets = vi.spyOn(env.ASSETS, "fetch");
    const response = await worker.fetch(
      new Request("https://admin.atlasez.test/admin/ui-review-prototype/"),
      env as never,
    );

    expect(response.status).toBe(401);
    expect(assets).not.toHaveBeenCalled();
  });

  it("does not match adjacent routes or allow writes", async () => {
    const fetch = vi.fn(async () => new Response("prototype fixture"));
    const env = { ASSETS: { fetch } };
    const adjacent = await worker.fetch(
      new Request(
        "https://admin.atlasez.test/admin/ui-review-prototype-private/",
      ),
      env as never,
    );
    const write = await worker.fetch(
      new Request("https://admin.atlasez.test/admin/ui-review-prototype/", {
        method: "POST",
      }),
      env as never,
    );

    expect(adjacent.status).toBe(404);
    expect(write.status).toBe(405);
    expect(write.headers.get("allow")).toBe("GET, HEAD");
    expect(fetch).not.toHaveBeenCalled();
  });
});
