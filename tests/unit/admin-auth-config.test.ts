import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("admin authentication configuration", () => {
  it("uses Cloudflare Access for production and commit previews", () => {
    const config = readFileSync(
      new URL("../../wrangler.admin.jsonc", import.meta.url),
      "utf8",
    );

    expect(config).toContain('"ADMIN_AUTH_MODE": "cloudflare-access"');
    expect(config).not.toContain('"ADMIN_AUTH_MODE": "google-oauth"');
  });
});
