import { describe, expect, it } from "vitest";
import { ADMIN_PAGE_PATHS, isAdminPagePath } from "../../src/lib/admin-routes";

describe("admin page routes", () => {
  it("exposes every generated admin page through the Worker", () => {
    expect(ADMIN_PAGE_PATHS).toHaveLength(23);

    for (const path of ADMIN_PAGE_PATHS) {
      expect(isAdminPagePath(path)).toBe(true);
      expect(isAdminPagePath(`${path}/`)).toBe(true);
    }
  });

  it("does not expose unrelated paths as admin pages", () => {
    expect(isAdminPagePath("/admin/unknown")).toBe(false);
    expect(isAdminPagePath("/atlas/ja/")).toBe(false);
  });
});
