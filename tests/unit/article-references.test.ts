import { describe, expect, it } from "vitest";
import {
  articleReferenceAnchor,
  citedReferenceIds,
  formatArticleReference,
  normalizeArticleReferences,
} from "../../src/lib/article-references.mjs";

describe("article references", () => {
  it("normalizes and deduplicates reusable references", () => {
    expect(
      normalizeArticleReferences([
        { id: "atiyah-macdonald", title: "Introduction", authors: "Atiyah", url: "https://example.com" },
        { id: "atiyah-macdonald", title: "duplicate" },
        { id: "ATiyah-Macdonald", title: "case variant" },
        { id: "Bad Key", title: "ignored" },
      ]),
    ).toEqual([
      { id: "atiyah-macdonald", title: "Introduction", authors: "Atiyah", url: "https://example.com" },
    ]);
  });

  it("preserves uppercase identifiers while accepting case-insensitive citations", () => {
    expect(normalizeArticleReferences([{ id: "GrothEndieck", title: "EGA" }])).toEqual([
      { id: "GrothEndieck", title: "EGA" },
    ]);
    expect(citedReferenceIds("[[cite:grothendieck]] and [[cite:GrothEndieck]].")).toEqual(["grothendieck"]);
  });

  it("extracts citation identifiers in first-use order", () => {
    expect(citedReferenceIds("[[cite:first]] and [[cite:second]] then [[cite:first]].")).toEqual(["first", "second"]);
  });

  it("formats a bibliography entry and anchor", () => {
    expect(formatArticleReference({ id: "book", title: "Algebra", authors: "Author", year: "2020", publisher: "Press" })).toBe("Author. Algebra (2020). Press");
    expect(articleReferenceAnchor("book")).toBe("reference-book");
  });
});
