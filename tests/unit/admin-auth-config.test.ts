import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("admin authentication configuration", () => {
  it("uses Google OAuth for the production admin Worker", () => {
    const config = readFileSync(
      new URL("../../wrangler.admin.jsonc", import.meta.url),
      "utf8",
    );

    expect(config).toContain('"ADMIN_AUTH_MODE": "google-oauth"');
  });
});
