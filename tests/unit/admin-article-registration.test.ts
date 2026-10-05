import { describe, expect, it } from "vitest";
import {
  isBulkArticleRegistrationCandidate,
  isTestArticleTitle,
} from "../../src/lib/admin-article-registration";

describe("bulk article registration candidates", () => {
  it("includes only confirmed unmanaged, non-test articles", () => {
    const catalog = [
      { title: "運営対象の記事", managementState: "unmanaged" },
      { title: "【テスト記事】表示確認", managementState: "unmanaged" },
      { title: "Test article", managementState: "unmanaged" },
      { title: "運営原稿の紐付け待ち", managementState: "needs-registration" },
      { title: "登録済み", managementState: "managed" },
      { title: "状態不明" },
    ];

    const candidates = catalog.filter((article) =>
      isBulkArticleRegistrationCandidate(article, true),
    );

    expect(candidates.map(({ title }) => title)).toEqual(["運営対象の記事"]);
    expect(candidates.length).toBe(1);
    expect(isBulkArticleRegistrationCandidate(catalog[0]!, false)).toBe(false);
  });

  it("uses the shared test-title rule for Japanese and English test labels", () => {
    expect(isTestArticleTitle("【テスト記事】表示確認")).toBe(true);
    expect(isTestArticleTitle("Test article")).toBe(true);
    expect(isTestArticleTitle("通常の記事")).toBe(false);
  });
});
