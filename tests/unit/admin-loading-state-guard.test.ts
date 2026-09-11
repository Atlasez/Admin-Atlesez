import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminPagesDir = new URL("../../src/pages/admin/", import.meta.url);

describe("管理ページの読み込み状態ガード", () => {
  it("APIを取得する全ページが共通の再試行UIと状態ヘルパーを利用する", () => {
    const pages = readdirSync(adminPagesDir)
      .filter((entry) => entry.endsWith(".astro"))
      .map(
        (entry) =>
          [entry, readFileSync(new URL(entry, adminPagesDir), "utf8")] as const,
      )
      .filter(([, source]) => /\bfetch\s*\(/.test(source));

    expect(pages.length).toBeGreaterThan(0);
    for (const [filename, source] of pages) {
      expect(source, `${filename} は AdminRetryNotice を表示する`).toContain(
        "AdminRetryNotice",
      );
      expect(
        source,
        `${filename} は createAdminLoadRetry を利用する`,
      ).toContain("createAdminLoadRetry");
    }
  });
});
