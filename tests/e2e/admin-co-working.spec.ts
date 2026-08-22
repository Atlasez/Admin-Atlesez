import { expect, test } from "@playwright/test";

test("S-1: Discordで告知された現在の同時作業会日程を表示する", async ({
  page,
}) => {
  await page.route("**/api/admin/operations?project=atlas", async (route) => {
    await route.fulfill({ json: { events: [] } });
  });
  await page.goto("./admin/co-working/?project=atlas");

  const schedule = page.locator("[data-regular-schedule]");
  await expect(schedule.locator(".regular-card")).toHaveCount(5);
  await expect(schedule).toContainText("毎週火曜日");
  await expect(schedule).toContainText("毎週水曜日");
  await expect(schedule).toContainText("毎週木曜日");
  await expect(schedule).toContainText("毎週金曜日");
  await expect(schedule).toContainText("毎週日曜日");
  await expect(schedule.locator("time")).toHaveText([
    "21:00〜",
    "21:00〜",
    "21:00〜",
    "21:00〜",
    "10:00〜",
  ]);
  await expect(schedule).toContainText("日本標準時（JST）");
});
