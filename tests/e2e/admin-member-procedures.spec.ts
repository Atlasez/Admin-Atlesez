import { expect, test, type Page } from "@playwright/test";

const project = { id: "thinking-cafe", name: "考えるカフェ", state: "paused" };
const pending = {
  id: "44444444-1111-4111-8111-111111111111",
  email: "member@example.test",
  procedure_type: "restart",
  effective_from: "2026-11-01",
  effective_until: "",
  timezone: "Europe/London",
  reason: "活動を再開します",
  note: "毎週参加できます",
  status: "pending",
  updated_at: "2026-10-05T04:00:00.000Z",
  review_note: "",
};

async function mockCommon(page: Page, manager = false) {
  await page.route("**/api/admin/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/admin/auth-status")
      return route.fulfill({
        json: {
          email: manager ? "manager@example.test" : "member@example.test",
          isManager: false,
          managerProjects: manager ? ["thinking-cafe"] : [],
          canAccessAdmin: false,
        },
      });
    if (path === "/api/admin/profile")
      return route.fulfill({
        json: { profile: { display_name: "検証メンバー" } },
      });
    if (path === "/api/admin/notifications")
      return route.fulfill({ json: { notifications: [] } });
    return route.fulfill({
      status: 403,
      json: { error: "許可されていないAPIです。" },
    });
  });
}

test("休止中の本人はタイムゾーン付き再開申請を送れ、送信失敗後も入力を保持して再試行できる", async ({
  page,
}) => {
  await mockCommon(page);
  const submitted: Array<Record<string, unknown>> = [];
  let accepted = false;
  await page.route("**/api/admin/member-procedures?**", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    expect(url.searchParams.get("project")).toBe("thinking-cafe");
    expect(url.searchParams.has("view")).toBe(false);
    if (request.method() === "POST") {
      submitted.push(request.postDataJSON() as Record<string, unknown>);
      if (submitted.length === 1)
        return route.fulfill({
          status: 503,
          json: { error: "一時的に申請できません。" },
        });
      accepted = true;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        projects: [project],
        project,
        canReview: false,
        requests: accepted ? [pending] : [],
      },
    });
  });
  await page.goto("admin/procedures/?project=thinking-cafe");
  await expect(page.locator("[data-membership-state]")).toHaveText(
    "現在の状態：休止中",
  );
  await expect(page.locator("[data-review]")).toBeHidden();
  const form = page.locator("[data-procedure-form]");
  await form.locator('[name="type"]').selectOption("restart");
  await form.locator('[name="effectiveFrom"]').fill("2026-11-01");
  await form.locator('[name="timezone"]').fill("Europe/London");
  await form.locator('[name="reason"]').fill(pending.reason);
  await form.locator('[name="note"]').fill(pending.note);
  await form.getByRole("button", { name: "申請する" }).click();
  await expect(page.locator("[data-form-message]")).toHaveText(
    "一時的に申請できません。",
  );
  await expect(form.locator('[name="reason"]')).toHaveValue(pending.reason);
  await expect(form.locator('[name="timezone"]')).toHaveValue("Europe/London");
  await expect(form.locator('[name="effectiveFrom"]')).toHaveValue(
    "2026-11-01",
  );
  await form.getByRole("button", { name: "申請する" }).click();
  await expect(page.locator("[data-form-message]")).toContainText(
    "申請を受け付けました",
  );
  expect(submitted).toHaveLength(2);
  expect(submitted[1]).toMatchObject({
    type: "restart",
    effectiveFrom: "2026-11-01",
    timezone: "Europe/London",
    reason: pending.reason,
    note: pending.note,
    confirm: false,
  });
  expect(submitted[1]).not.toHaveProperty("email");
  await expect(page.locator("[data-history]")).toContainText("活動再開");
  await expect(page.locator("[data-history]")).toContainText("Europe/London");
  await expect(form.locator('[name="reason"]')).toHaveValue("");
});

test("本人の手続き一覧の読込失敗から再試行しても記入中の申請を消さない", async ({
  page,
}) => {
  await mockCommon(page);
  let loads = 0;
  await page.route("**/api/admin/member-procedures?**", (route) => {
    expect(route.request().method()).toBe("GET");
    loads += 1;
    if (loads === 1)
      return route.fulfill({
        status: 503,
        json: { error: "一覧を読み込めません。" },
      });
    return route.fulfill({
      json: { projects: [project], project, canReview: false, requests: [] },
    });
  });
  await page.goto("admin/procedures/?project=thinking-cafe");
  const form = page.locator("[data-procedure-form]");
  await expect(page.locator("[data-admin-load-error]")).toBeVisible();
  await form.locator('[name="reason"]').fill("読み込み待ちに入力した再開理由");
  await form.locator('[name="timezone"]').fill("America/New_York");
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(page.locator("[data-admin-load-error]")).toBeHidden();
  await expect(form.getByRole("button", { name: "申請する" })).toBeEnabled();
  await expect(form.locator('[name="reason"]')).toHaveValue(
    "読み込み待ちに入力した再開理由",
  );
  await expect(form.locator('[name="timezone"]')).toHaveValue(
    "America/New_York",
  );
  expect(loads).toBe(2);
});

test("担当責任者の審査は対象プロジェクト・更新時刻・引き継ぎ確認を送る", async ({
  page,
}) => {
  await mockCommon(page, true);
  let reviewed = false;
  const bodies: Array<Record<string, unknown>> = [];
  const activeProject = { ...project, state: "active" };
  const row = {
    ...pending,
    procedure_type: "pause",
    handover: {
      tasks: [{ id: "task-cafe", title: "引き継ぐ担当作業" }],
      documents: [],
    },
  };
  await page.route("**/api/admin/member-procedures?**", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    expect(url.searchParams.get("project")).toBe("thinking-cafe");
    expect(url.searchParams.get("view")).toBe("review");
    if (request.method() === "POST") {
      bodies.push(request.postDataJSON() as Record<string, unknown>);
      if (bodies.length === 1)
        return route.fulfill({
          status: 409,
          json: { error: "担当タスクの引き継ぎが未完了です。" },
        });
      reviewed = true;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        projects: [activeProject],
        project: activeProject,
        canReview: true,
        requests: [{ ...row, status: reviewed ? "applied" : "pending" }],
      },
    });
  });
  await page.goto("admin/procedures/?project=thinking-cafe&view=review");
  await expect(page.locator("[data-history-title]")).toHaveText(
    "プロジェクトの申請確認",
  );
  await expect(page.locator("[data-self]")).toBeHidden();
  await expect(
    page.getByRole("link", { name: "引き継ぐ担当作業" }),
  ).toHaveAttribute("href", "/admin/task-detail/?task=task-cafe");
  await page.locator("[data-note]").fill("責任者として確認しました");
  await page.locator("[data-handover]").fill("後任への引き継ぎ記録");
  await page.locator("[data-confirm]").check();
  await page.getByRole("button", { name: "承認する", exact: true }).click();
  await expect(page.locator("[data-message]")).toHaveText(
    "担当タスクの引き継ぎが未完了です。",
  );
  await expect(page.locator("[data-note]")).toHaveValue(
    "責任者として確認しました",
  );
  await expect(page.locator("[data-handover]")).toHaveValue(
    "後任への引き継ぎ記録",
  );
  await expect(page.locator("[data-confirm]")).toBeChecked();
  await page.getByRole("button", { name: "承認する", exact: true }).click();
  await expect(page.locator("[data-message]")).toHaveText("処理しました。");
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual({
    id: pending.id,
    action: "approve",
    expectedUpdatedAt: pending.updated_at,
    reviewNote: "責任者として確認しました",
    handoverNote: "後任への引き継ぎ記録",
    handoverConfirmed: true,
  });
  await expect(page.locator("[data-history]")).toContainText("反映済み");
});
