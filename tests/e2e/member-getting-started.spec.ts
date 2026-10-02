import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const width of [1280, 390]) {
  test(`参加後の案内は${width}pxで初回作業と相談先に進める`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/admin/**", (route) =>
      route.fulfill({
        json: {
          email: "member@atlasez.test",
          isManager: false,
          notifications: [],
          profile: { display_name: "検証会員" },
        },
      }),
    );
    await page.goto("admin/portal/");
    await page.getByRole("link", { name: "参加後の案内 →" }).click();
    await expect(
      page.getByRole("heading", { name: "参加後の案内", exact: true }),
    ).toBeVisible();
    await expect(page.locator("[data-admin-nav]")).toHaveAttribute(
      "data-current-site",
      "portal",
    );
    await expect(
      page.getByRole("link", { name: "マイページ", exact: true }).last(),
    ).toHaveAttribute("href", "/admin/member-profile/");
    await expect(
      page.getByRole("link", { name: "タスクテンプレート", exact: true }),
    ).toHaveAttribute("href", "/admin/task-templates/");
    await page.getByRole("link", { name: "困ったとき", exact: true }).click();
    await page
      .getByText("保存が終わらない・エラーが出る", { exact: true })
      .click();
    await expect(
      page.getByText("入力内容を手元に控え", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Atlasezのお問い合わせ" }).last(),
    ).toHaveAttribute("href", "https://atlasez.org/contact/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const accessibility = await new AxeBuilder({ page })
      .include("main")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
}
