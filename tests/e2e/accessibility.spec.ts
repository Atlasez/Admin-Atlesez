import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** axe-coreによる自動アクセシビリティ検査（WCAG 2.2 AA目標） */

const pages = [
  "./",
  "about/",
  "about/philosophy/",
  "about/organization/",
  "about/members/",
  "about/history/",
  "projects/",
  "news/",
  "join/",
  "admin/ui-prototype/",
  "atlas/ja/",
  "atlas/ja/guide/",
  "atlas/ja/mathematics/",
  "atlas/ja/mathematics/set-theory/",
  "atlas/ja/mathematics/group-theory/group-definition/",
  "atlas/ja/map/",
  "atlas/ja/search/",
  "atlas/ja/list/",
];

for (const path of pages) {
  test(`axe検査: ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      // 学習地図canvasはrole=applicationの代替表示を提供済み
      .exclude("#learning-map")
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
      })),
    ).toEqual([]);
  });
}

test("テーマ切替のアクセシブル名に表示ラベルを含める", async ({ page }) => {
  await page.goto("./");

  const toggle = page.locator("[data-theme-toggle]");
  const visibleLabel = toggle.locator("[data-theme-label]");
  const modes = ["ダーク表示", "ブラック表示", "ライト表示"];

  for (const [index, label] of modes.entries()) {
    await expect(visibleLabel).toHaveText(label);
    await expect(toggle).toHaveAccessibleName(label);
    if (index < modes.length - 1) await toggle.click();
  }
});
