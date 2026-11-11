import { describe, expect, it } from "vitest";
import { isTestArticleTitle } from "../../src/lib/article-test-classification";

describe("test article title classification", () => {
  it("recognizes Japanese and English test labels", () => {
    expect(isTestArticleTitle("【テスト記事】表示確認")).toBe(true);
    expect(isTestArticleTitle("Test article")).toBe(true);
    expect(isTestArticleTitle("通常の記事")).toBe(false);
  });
});
