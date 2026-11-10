import { expect, test } from "@playwright/test";

const applicationId = "eeeeeeee-2222-4222-8222-222222222222";

test("確定済みの審査は読み取り専用として表示される", async ({ page }) => {
  let reviewWrites = 0;
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/auth-status") {
      await route.fulfill({
        json: { email: "reviewer@example.invalid", isManager: true },
      });
      return;
    }
    if (
      url.pathname.endsWith("/interview-review") &&
      route.request().method() === "PUT"
    ) {
      reviewWrites++;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (url.pathname.endsWith("/interview")) {
      await route.fulfill({
        json: {
          application: {
            id: applicationId,
            name: "検証応募者",
            email: "applicant@example.invalid",
            status: "accepted",
          },
          subjectLabels: { mathematics: "数学" },
          interview: {
            id: "interview-finalized",
            status: "scheduled",
          },
          review: {
            id: "review-finalized",
            note: "確定済みメモ",
            assignedSubjects: ["mathematics"],
            decision: "accepted",
            finalized_at: "2026-11-04T10:00:00.000Z",
          },
        },
      });
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.goto(
    `./admin/application-interview/?application=${applicationId}&project=thinking-cafe`,
  );

  await expect(page.locator("[data-notice]")).toContainText("採否は確定済み");
  await expect(page.locator("[data-notes]")).toBeDisabled();
  await expect(page.locator("[data-decision]")).toBeDisabled();
  await expect(page.locator("[data-subject-options] input")).toBeDisabled();
  await expect(page.locator("[data-save]")).toBeDisabled();
  await page.locator("[data-save]").click({ force: true });
  expect(reviewWrites).toBe(0);
});

test("審査メモ保存後に履歴確認が失敗したら採否確定を止める", async ({
  page,
}) => {
  let reviewReads = 0;
  let reviewWrites = 0;
  let completionCalls = 0;
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === "/api/admin/auth-status") {
      await route.fulfill({
        json: { email: "reviewer@example.invalid", isManager: true },
      });
      return;
    }
    if (url.pathname.endsWith("/interview-review") && method === "PUT") {
      reviewWrites++;
      await route.fulfill({
        status: 503,
        json: {
          error:
            "面談メモは保存されましたが、履歴の確定を確認できません。採否確定を停止しました。状態を再読み込みしてください。",
          code: "INTERVIEW_REVIEW_HISTORY_UNCONFIRMED",
          reviewSaved: true,
        },
      });
      return;
    }
    if (url.pathname.endsWith("/interview/complete")) {
      completionCalls++;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (url.pathname.endsWith("/interview")) {
      reviewReads++;
      await route.fulfill({
        json: {
          application: {
            id: applicationId,
            name: "検証応募者",
            email: "applicant@example.invalid",
            status: "reviewing",
          },
          subjectLabels: { mathematics: "数学" },
          interview: {
            id: "interview-scheduled",
            status: "scheduled",
            scheduledAt: "2026-11-15T10:00:00.000Z",
          },
          review: {
            id: "review-draft",
            note: reviewReads > 1 ? "保存済みの再読込メモ" : "",
            assignedSubjects: ["mathematics"],
            decision: reviewReads > 1 ? "rejected" : "pending",
            finalized_at: null,
          },
        },
      });
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.goto(
    `./admin/application-interview/?application=${applicationId}&project=thinking-cafe`,
  );
  await page.locator("[data-notes]").fill("保存済みの再読込メモ");
  await page.locator("[data-decision]").selectOption("rejected");
  await page.locator("[data-save]").click();

  await expect(page.locator("[data-notice]")).toContainText(
    "採否確定を停止しました",
  );
  await expect(page.locator("[data-notes]")).toHaveValue(
    "保存済みの再読込メモ",
  );
  expect(reviewReads).toBe(2);
  expect(reviewWrites).toBe(1);
  expect(completionCalls).toBe(0);
});
