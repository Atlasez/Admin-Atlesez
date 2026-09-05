import { describe, expect, it } from "vitest";
import { ADMIN_PAGE_PATHS, isAdminPagePath } from "../../src/lib/admin-routes";

describe("admin page routes", () => {
  it("exposes every generated admin page through the Worker", () => {
    expect(ADMIN_PAGE_PATHS).toHaveLength(33);

    for (const path of ADMIN_PAGE_PATHS) {
      expect(isAdminPagePath(path)).toBe(true);
      expect(isAdminPagePath(`${path}/`)).toBe(true);
    }
  });

  it("does not expose unrelated paths as admin pages", () => {
    expect(isAdminPagePath("/admin/unknown")).toBe(false);
    expect(isAdminPagePath("/atlas/ja/")).toBe(false);
  });

  it("exposes the nested member profile editor without adding it to top-level navigation", () => {
    expect(isAdminPagePath("/admin/member-profile/edit")).toBe(true);
    expect(isAdminPagePath("/admin/member-profile/edit/")).toBe(true);
    expect(ADMIN_PAGE_PATHS).not.toContain("/admin/member-profile/edit");
  });

  it("exposes the nested learning content prototype without adding it to top-level navigation", () => {
    expect(isAdminPagePath("/admin/ui-prototype/learning-content")).toBe(true);
    expect(isAdminPagePath("/admin/ui-prototype/learning-content/")).toBe(true);
    expect(ADMIN_PAGE_PATHS).not.toContain(
      "/admin/ui-prototype/learning-content",
    );
  });
});
