import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const artifactDir = new URL("../screenshots", import.meta.url).pathname;
const muted = "rgb(102, 114, 123)";
const green = "rgb(82, 164, 80)";
const accent = "rgb(23, 63, 98)";

const screens = [
  ["portal-before", "/portal/before/"],
  ["portal-after", "/portal/after/"],
  ["notifications-before", "/notifications/before/"],
  ["notifications-after", "/notifications/after/"],
] as const;

async function shot(page: Page, name: string) {
  mkdirSync(artifactDir, { recursive: true });
  await page.screenshot({
    path: `${artifactDir}/${name}.png`,
    fullPage: true,
  });
}

test("index explains the proposal and keeps it out of production", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  await expect(
    page.getByRole("heading", { name: "運営サイト UIプロトタイプ" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "ポータル · 案" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "通知" })).toBeVisible();
});

test("portal proposal mutes zero KPIs and keeps the application link", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/portal/before/");
  const beforeZero = page.locator("[data-summary-value='今日の要対応']");
  await expect(beforeZero).toHaveCSS("color", green);
  await expect(
    page.getByText("あなたの権限に応じた参加中のプロジェクトです。"),
  ).toBeVisible();
  await shot(page, "portal-before-1280");

  await page.goto("/portal/after/");
  await expect(page.locator("[data-summary-value='今日の要対応']")).toHaveCSS(
    "color",
    muted,
  );
  await expect(page.locator("[data-summary-value='未読通知']")).toHaveCSS(
    "color",
    muted,
  );
  await expect(page.locator("[data-summary-value='承認待ち']")).toHaveCSS(
    "color",
    green,
  );
  await expect(
    page.getByText("あなたの権限に応じた参加中のプロジェクトです。"),
  ).toHaveCount(0);
  await expect(
    page.getByText("プロフィール、相談先、最初の小タスクを確認しましょう。"),
  ).toHaveCount(0);
  await expect(
    page.getByText("参加したいプロジェクトを選んで応募できます。"),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "応募フォームへ →" })).toHaveCSS(
    "background-color",
    accent,
  );
  const intakeBorder = await page.locator(".my-intake").evaluate((element) => {
    const style = getComputedStyle(element);
    return `${style.borderLeftWidth} ${style.borderLeftStyle} ${style.borderLeftColor}`;
  });
  expect(intakeBorder.startsWith("0px")).toBe(true);
  const projectBorder = await page
    .locator(".project-entry")
    .evaluate((element) => getComputedStyle(element).borderTopWidth);
  expect(projectBorder).toBe("0px");
  const emptyMark = await page
    .locator(".todo-empty")
    .evaluate((element) => getComputedStyle(element, "::before").content);
  expect(emptyMark === "none" || emptyMark === "normal").toBe(true);
  await shot(page, "portal-after-1280");
});

test("notifications proposal uses a Japanese crumb and hides the zero summary", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/notifications/before/");
  await expect(page.locator(".admin-breadcrumbs")).toContainText(
    "notifications",
  );
  await expect(page.getByText("件が未読")).toBeVisible();
  await expect(page.getByText("0件を表示")).toBeVisible();
  await shot(page, "notifications-before-1280");

  await page.goto("/notifications/after/");
  const crumb = page.locator(".admin-breadcrumbs");
  await expect(crumb).toContainText("通知");
  await expect(crumb).not.toContainText("notifications");
  await expect(page.getByText("件が未読")).toHaveCount(0);
  await expect(page.getByText("0件を表示")).toHaveCount(0);
  await expect(
    page.getByText("通知元ごとの最近の通知を時系列で確認できます。"),
  ).toHaveCount(0);
  await expect(page.getByText("通知はまだありません。")).toBeVisible();
  await shot(page, "notifications-after-1280");
});

test("mobile header proposal is a single row", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/portal/before/");
  const beforeLogo = await page.locator(".admin-nav-brand-logo").boundingBox();
  const beforeAccount = await page.locator(".admin-account").boundingBox();
  expect(beforeLogo).toBeTruthy();
  expect(beforeAccount).toBeTruthy();
  expect(beforeAccount?.y ?? 0).toBeGreaterThan((beforeLogo?.y ?? 0) + 24);
  await expect(page.getByText("表示設定").first()).toBeVisible();
  await shot(page, "portal-before-375");

  await page.goto("/portal/after/");
  const afterLogo = await page.locator(".admin-nav-brand-logo").boundingBox();
  const afterAvatar = await page.locator(".admin-account-avatar").boundingBox();
  expect(afterLogo && afterAvatar).toBeTruthy();
  expect(Math.abs((afterLogo?.y ?? 0) - (afterAvatar?.y ?? 0))).toBeLessThan(
    16,
  );
  const header = await page.locator(".admin-nav").boundingBox();
  expect(header?.height ?? 999).toBeLessThan(84);
  await expect(
    page.locator(".admin-account").getByText("表示設定"),
  ).toBeHidden();
  await page.getByRole("button", { name: "メニュー" }).click();
  await expect(
    page.locator(".mobile-overflow").getByText("表示設定"),
  ).toBeVisible();
  await expect(
    page
      .locator(".mobile-overflow")
      .getByRole("button", { name: "ログアウト" }),
  ).toBeVisible();
  await shot(page, "portal-after-375-menu");
  await page.getByRole("button", { name: "メニュー" }).click();
  await shot(page, "portal-after-375");

  await page.goto("/notifications/before/");
  await shot(page, "notifications-before-375");
  await page.goto("/notifications/after/");
  await shot(page, "notifications-after-375");
  const mobileHeader = await page.locator(".admin-nav").boundingBox();
  expect(mobileHeader?.height ?? 999).toBeLessThan(84);
});
