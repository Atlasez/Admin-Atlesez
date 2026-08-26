import { describe, expect, it } from "vitest";
import { diagnoseArticleSource } from "../../src/lib/article-diagnostics.mjs";

describe("article source diagnostics", () => {
  it("finds unclosed math, directives, code, duplicate ids, and unknown citations", () => {
    const result = diagnoseArticleSource(
      ":::prop 命題 {#same}\n\n$x\n\n:::prop 別 {#same}\n```\ncode\n[[cite:missing]]",
    );
    expect(result.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "inline-math-unclosed",
        "directive-unclosed",
        "code-unclosed",
        "duplicate-statement-id",
        "unresolved-citation",
      ]),
    );
  });

  it("accepts local and external references and registered citations", () => {
    const result = diagnoseArticleSource(
      ":::prop 命題 {#local}\n:::\n\n[[ref:local]] [[ref:external]] [[cite:book]]",
      { externalReferenceIds: ["external"], references: [{ id: "book" }] },
    );
    expect(result).toEqual([]);
  });
});
