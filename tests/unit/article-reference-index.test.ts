import { describe, expect, it } from "vitest";
import { buildArticleStatementIndex } from "../../src/lib/article-reference-index.mjs";

describe("article statement reference index", () => {
  it("numbers titled and untitled directives in source order", () => {
    const index = buildArticleStatementIndex([
      {
        body: [
          "::: defi 環 {#ring}",
          "本文",
          ":::",
          "",
          "::: theorem {#unit}",
          "本文",
          ":::",
          "",
          "::: remark {#ignored}",
          "本文",
          ":::",
        ].join("\n"),
        data: {
          articleId: "article-a",
          locale: "ja",
          title: "代数学入門",
          subject: "mathematics",
          category: "algebra",
          slug: "intro",
        },
      },
    ]);

    expect(index).toEqual([
      expect.objectContaining({
        id: "ring",
        label: "定義",
        number: 1,
        articleTitle: "代数学入門",
      }),
      expect.objectContaining({
        id: "unit",
        label: "定理",
        number: 2,
      }),
    ]);
  });
});
