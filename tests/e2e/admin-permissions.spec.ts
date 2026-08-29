import { expect, test } from "@playwright/test";

test("参加者カードの権限操作は主CTAと補助操作を整理して表示する", async ({
  page,
}) => {
  await page.route("**/api/admin/report-admin-permissions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        permissions: [
          {
            email: "editor@example.com",
            display_name: "編集担当",
            subjects: "mathematics",
            university: "",
            year: "",
            interests: "",
          },
        ],
        workflowRoles: [],
      }),
    });
  });

  await page.goto("./admin/permissions/?project=atlas");

  const card = page.locator(".member-card");
  await expect(card).toBeVisible();
  const buttons = card.locator(".member-card__actions button");
  await expect(buttons).toHaveCount(3);

  const buttonMetrics = await buttons.evaluateAll((elements) =>
    elements.map((element) => ({
      text: element.textContent?.trim(),
      height: element.getBoundingClientRect().height,
      gridColumn: getComputedStyle(element).gridColumn,
    })),
  );
  expect(buttonMetrics[0]?.text).toBe("全分野管理者に変更");
  expect(buttonMetrics[0]?.height).toBeLessThanOrEqual(40);
  expect(buttonMetrics[2]?.height).toBeLessThanOrEqual(40);
  expect(buttonMetrics[1]?.gridColumn).toBe("1 / -1");
});
