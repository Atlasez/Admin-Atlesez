import { expect, test, type Page } from "@playwright/test";

/**
 * ブラックモードの白い面の回帰検査。
 * ページごとにライトテーマの背景が残ると、設定を黒にしても大きな
 * 白い矩形が表示されるため、主要な管理ルートを同じ条件で横断する。
 */
const routes = [
  "admin/portal/",
  "admin/member-tasks/",
  "admin/articles/",
  "admin/editor/",
  "admin/genres/",
  "admin/genre-roles/",
  "admin/permissions/?project=atlas",
  "admin/introductions/",
  "admin/profile-requests/",
  "admin/project-profile-requests/",
  "admin/applications/",
  "admin/workspace/",
  "admin/reports/",
  "admin/operations/",
  "admin/operations-statistics/",
  "admin/member-management/",
  "admin/procedures/?project=atlas",
  "admin/guide/",
  "admin/calendar/",
  "admin/progress/",
  "admin/review/",
  "admin/rules/",
  "admin/analytics/",
] as const;

const mockAdminApis = async (page: Page) => {
  await page.route("**/api/admin/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
};

test("管理画面の暗色・ブラックモードに白い大面積サーフェスを残さない", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await mockAdminApis(page);
  await page.goto(routes[0], { waitUntil: "domcontentloaded" });

  for (const background of ["black", "dark"] as const) {
    await page.evaluate((bg) => {
      localStorage.setItem("atlasez-prefs", JSON.stringify({ bg }));
    }, background);

    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(120);
      const whiteSurfaces = await page.evaluate(() => {
        const isNearWhite = (color: string) => {
          const channels = color.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
          return (
            channels.length >= 3 &&
            channels.slice(0, 3).every((channel) => channel >= 245)
          );
        };
        return [...document.querySelectorAll<HTMLElement>("*")]
          .map((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName,
              className:
                typeof element.className === "string" ? element.className : "",
              area: Math.round(rect.width * rect.height),
              background: style.backgroundColor,
            };
          })
          .filter(
            (element) => element.area > 500 && isNearWhite(element.background),
          );
      });

      expect(
        whiteSurfaces,
        `${background} / ${route} に白い背景が残っています`,
      ).toEqual([]);
    }
  }
});
