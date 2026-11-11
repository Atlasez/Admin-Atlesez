import { expect, test } from "@playwright/test";
import { SEMINAR_REVIEW_PATH } from "../../src/lib/admin-routes";

const seminar = {
  number: 32,
  title: "リーマン面ゼミ",
  recruitment: "open",
  phase: "active",
  acceptingApplications: true,
  details: {
    theme: "複素幾何学",
    purpose: "リーマン面を理解する",
    method: "輪読",
    materials: "Forster",
    organizer: "自主ゼミ会",
  },
};

test("ゼミ運営担当者は企画申請を確認・承認できる", async ({ page }) => {
  let status = "pending";
  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/admin/auth-status")
      return route.fulfill({
        json: {
          email: "operator@atlasez.test",
          isManager: false,
          managerProjects: ["seminar-platform"],
        },
      });
    return route.fulfill({ json: { notifications: [], profile: {} } });
  });
  await page.route("**/api/seminars/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/seminars/session")
      return route.fulfill({
        json: {
          signedIn: true,
          email: "operator@atlasez.test",
          canReview: true,
        },
      });
    if (path === "/api/seminars/32/review") {
      expect(route.request().postDataJSON()).toMatchObject({
        decision: "approved",
      });
      status = "approved";
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        proposals: [
          {
            ...seminar,
            profile: { name: "企画者" },
            email: "host@atlasez.test",
            operationsNote: "",
            status,
            createdAt: "2026-11-11T03:00:00Z",
          },
        ],
        imports: [],
        feedback: [],
      },
    });
  });

  await page.goto(SEMINAR_REVIEW_PATH);
  await expect(
    page.getByRole("heading", { name: "ゼミ企画審査" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "メニュー", exact: true }).click();
  const adminMenu = page.getByRole("navigation", {
    name: "運営用サイトメニュー",
  });
  await expect(
    adminMenu.getByRole("link", { name: "ゼミ企画審査", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(/リーマン面ゼミ ・ 審査待ち/)).toBeVisible();
  await expect(page.getByText("企画申請を読み込んでいます。")).toBeHidden();
  await page.getByRole("button", { name: "承認する" }).click();
  await expect(page.getByText(/リーマン面ゼミ ・ 承認済み/)).toBeVisible();
  await page
    .getByRole("combobox", { name: "状態", exact: true })
    .selectOption("pending");
  await expect(
    page.getByText("この状態の企画申請はありません。"),
  ).toBeVisible();
});
