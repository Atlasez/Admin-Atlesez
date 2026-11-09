import { describe, expect, it } from "vitest";
import {
  normalizeDesignPrincipleHref,
  parseDesignPrincipleDraft,
} from "../../src/lib/admin-design-principles";

describe("ADMIN design principle input", () => {
  it("normalizes local feedback links while rejecting external or unknown paths", () => {
    expect(
      normalizeDesignPrincipleHref(
        "https://admin.atlasez.org/admin/editor/?document=abc#feedback",
      ),
    ).toBe("/admin/editor/?document=abc#feedback");
    expect(normalizeDesignPrincipleHref("/admin/review/?view=feedback")).toBe(
      "/admin/review/?view=feedback",
    );
    expect(
      normalizeDesignPrincipleHref("https://example.com/admin/editor/"),
    ).toBe(null);
    expect(normalizeDesignPrincipleHref("//example.com/admin/editor/")).toBe(
      null,
    );
    expect(normalizeDesignPrincipleHref("/admin/unknown/")).toBe(null);
  });

  it("requires source feedback and returns normalized reusable principle data", () => {
    expect(
      parseDesignPrincipleDraft({
        title: "多数の選択肢",
        category: "selection",
        statement: "候補が多い複数選択は、検索可能なタグ追加にする。",
        rationale: "一覧を長くしすぎず、必要な候補をすばやく見つけられる。",
        status: "candidate",
        sources: [
          {
            label: "タスク担当者選択のフィードバック",
            href: "/admin/editor/?document=abc#feedback",
            excerpt: "チェックボックスの一覧ではなくタグ形式にしてほしい。",
          },
        ],
      }),
    ).toEqual({
      ok: true,
      value: {
        title: "多数の選択肢",
        category: "selection",
        statement: "候補が多い複数選択は、検索可能なタグ追加にする。",
        rationale: "一覧を長くしすぎず、必要な候補をすばやく見つけられる。",
        status: "candidate",
        sources: [
          {
            label: "タスク担当者選択のフィードバック",
            href: "/admin/editor/?document=abc#feedback",
            excerpt: "チェックボックスの一覧ではなくタグ形式にしてほしい。",
          },
        ],
      },
    });
    expect(
      parseDesignPrincipleDraft({
        title: "No source",
        category: "other",
        statement: "An active principle should trace back to feedback.",
        status: "active",
        sources: [],
      }),
    ).toMatchObject({ ok: false });
  });
});
