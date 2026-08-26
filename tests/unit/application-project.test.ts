import { describe, expect, it } from "vitest";
import { resolveApplicationProjectSlug } from "../../src/lib/application-project";

describe("resolveApplicationProjectSlug", () => {
  it("recognizes the student-council public application URL", () => {
    expect(
      resolveApplicationProjectSlug(
        "/apply/student-council-exchange/",
        "",
      ),
    ).toBe("student-council-exchange");
  });

  it("keeps the query-string menu URL working", () => {
    expect(
      resolveApplicationProjectSlug(
        "/apply/",
        "?project=student-council-exchange",
      ),
    ).toBe("student-council-exchange");
  });

  it("falls back safely for an unknown project", () => {
    expect(resolveApplicationProjectSlug("/apply/unknown/", "")).toBe(
      "atlas",
    );
  });
});
