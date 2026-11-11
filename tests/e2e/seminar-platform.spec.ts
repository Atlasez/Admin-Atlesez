import { expect, test } from "@playwright/test";
import { seminarFields } from "../../src/lib/seminar-fields";

const seminar = {
  number: 32,
  title: "リーマン面ゼミ",
  recruitment: "open",
  phase: "active",
  acceptingApplications: true,
  sourceUrl: null,
  details: {
    theme: "複素幾何学",
    purpose: "リーマン面を理解する",
    method: "輪読",
    materials: "Forster",
    organizer: "自主ゼミ会",
  },
};

test("一般ページの検索から詳細・サイト内参加申請へ進む", async ({ page }) => {
  let submitted = false;
  await page.route("**/api/seminars**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/seminars/session") {
      return route.fulfill({
        json: { signedIn: true, email: "reader@atlasez.test" },
      });
    }
    if (path === "/api/seminars/32/join") {
      expect(route.request().postDataJSON()).toMatchObject({
        name: "テスト参加者",
        hostNote: "見学希望",
      });
      submitted = true;
      return route.fulfill({ status: 201, json: { id: "application-1" } });
    }
    if (path === "/api/seminars/32") return route.fulfill({ json: seminar });
    return route.fulfill({ json: { seminars: [seminar] } });
  });
  await page.goto("seminars/");
  await expect(page.getByText("ログイン中", { exact: true })).toBeVisible();
  const search = page.getByRole("searchbox");
  await search.fill("存在しないゼミ");
  await expect(
    page.getByText("検索条件に一致するゼミはありません。"),
  ).toBeVisible();
  await search.fill("０００００３２ Forster");
  await expect(page.getByText("1件", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "リーマン面ゼミ" }).click();
  await expect(
    page.getByRole("heading", { name: "リーマン面ゼミ" }),
  ).toBeVisible();
  await expect(page.getByText("リーマン面を理解する")).toBeVisible();
  await page.getByRole("link", { name: "このゼミに参加申請する" }).click();
  await expect(page.getByLabel("ゼミ名・番号（必須）")).toHaveValue("32");
  await page.getByLabel("氏名（必須）", { exact: true }).fill("テスト参加者");
  await page.locator('[name="hostNote"]').fill("見学希望");
  await page.getByRole("button", { name: "参加を申請する" }).click();
  await expect(
    page.getByRole("heading", { name: "参加申請を受け付けました" }),
  ).toBeVisible();
  expect(submitted).toBe(true);
});

test("Googleログインへの導線は選択したゼミを保持する", async ({ page }) => {
  await page.route("**/api/seminars/session", (route) =>
    route.fulfill({ json: { signedIn: false } }),
  );
  await page.goto("seminars/join/?number=32");
  await expect(
    page.getByRole("link", { name: "Googleでログイン" }),
  ).toHaveAttribute(
    "href",
    "/auth/google/login?returnTo=%2Fseminars%2Fjoin%2F%3Fnumber%3D32",
  );
});

test("企画の送信と運営承認をサイト内で行う", async ({ page }) => {
  let status = "pending";
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
    if (path === "/api/seminars/proposals") {
      expect(route.request().postDataJSON()).toMatchObject({
        title: seminar.title,
        observation: "可",
      });
      return route.fulfill({ status: 201, json: { number: seminar.number } });
    }
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
  await page.goto("seminars/propose/");
  await page.getByLabel("氏名（必須）", { exact: true }).fill("企画者");
  await page.getByLabel("ゼミ名（必須）", { exact: true }).fill(seminar.title);
  for (const field of seminarFields.filter((item) => !("optional" in item))) {
    await page.getByLabel(`${field.label}（必須）`, { exact: true }).fill("可");
  }
  await page.getByRole("button", { name: "企画を送信する" }).click();
  await expect(
    page.getByRole("heading", { name: "企画を受け付けました" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "運営ページ", exact: true }).click();
  await expect(page.getByText(/リーマン面ゼミ ・ 審査待ち/)).toBeVisible();
  await page.getByRole("button", { name: "承認する" }).click();
  await expect(page.getByText(/リーマン面ゼミ ・ 承認済み/)).toBeVisible();
});
