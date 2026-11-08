import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  { file: "portal.html", name: "portal" },
  { file: "atlas.html", name: "atlas" },
];
const viewports = [
  { width: 1440, height: 1000, name: "desktop" },
  { width: 768, height: 1024, name: "tablet" },
  { width: 390, height: 844, name: "mobile" },
];

for (const pageSpec of pages) {
  for (const viewport of viewports) {
    test(`${pageSpec.name} renders at ${viewport.name} size`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto(pageSpec.file);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator("body")).toHaveCSS(
        "background-color",
        "rgb(21, 21, 21)",
      );
      await expect
        .poll(() =>
          page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
          })),
        )
        .toEqual({
          scrollWidth: viewport.width,
          viewportWidth: viewport.width,
        });
      await expect(page).toHaveScreenshot(
        `${pageSpec.name}-${viewport.name}.png`,
        {
          fullPage: true,
          animations: "disabled",
          maxDiffPixelRatio: 0.005,
        },
      );
    });
  }
}

test("portal preserves five metrics and the grouped project structure", async ({
  page,
}) => {
  await page.goto("portal.html");
  await expect(page.locator(".metric")).toHaveCount(5);
  await expect(
    page.getByRole("heading", { name: "参加中のプロジェクト" }),
  ).toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(4);
  await expect(
    page.locator(".project-entry-groups > .project-group"),
  ).toHaveCount(2);
  await page.locator('.project-card[href="./atlas.html"]').click();
  await expect(page).toHaveURL(/atlas\.html$/);
});

test("Atlas preserves its four categories and tile counts", async ({
  page,
}) => {
  await page.goto("atlas.html");
  await expect(page.locator(".function-group")).toHaveCount(4);
  await expect(
    page.locator(".function-group").nth(0).locator(".function-tiles a"),
  ).toHaveCount(3);
  await expect(
    page.locator(".function-group").nth(1).locator(".function-tiles a"),
  ).toHaveCount(4);
  await expect(
    page.locator(".function-group").nth(2).locator(".function-tiles a"),
  ).toHaveCount(4);
  await expect(
    page.locator(".function-group").nth(3).locator(".function-tiles a"),
  ).toHaveCount(1);
  await expect(page.locator(".function-tiles a").first()).toHaveAttribute(
    "target",
    "_blank",
  );
});

test("local preview controls work without navigating away", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("portal.html");
  await page.getByRole("button", { name: "ナビゲーションを開く" }).click();
  await expect(
    page.getByRole("navigation", { name: "メインナビゲーション" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ナビゲーションを開く" }).click();
  await page.getByRole("button", { name: "ADMIN内を検索" }).click();
  await page.getByPlaceholder("ページ・機能を検索").fill("アトラス");
  await expect(page.locator(".search-results a").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#search-panel")).toBeHidden();
  await page.locator("[data-settings-toggle]").click();
  await page.getByRole("slider", { name: "文字サイズ" }).fill("1.2");
  await expect(page.locator("[data-font-size-value]")).toHaveText("120%");
  await expect(page).toHaveURL(/portal\.html$/);
});

for (const pageSpec of pages) {
  test(`${pageSpec.name} passes axe accessibility checks at desktop and mobile`, async ({
    page,
  }) => {
    for (const viewport of [viewports[0], viewports[2]]) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto(pageSpec.file);
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations,
        `${pageSpec.name} ${viewport.name} axe violations`,
      ).toEqual([]);
    }
  });
}
