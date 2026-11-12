import { expect, test, type Page } from "@playwright/test";

const memberEmail = "member@example.test";
const operatorEmail = "manager@example.test";
const consultantEmail = "consultant@example.test";
const project = {
  id: "thinking-cafe",
  slug: "thinking-cafe",
  name: "考えるカフェ",
};
const entry = {
  email: memberEmail,
  display_name: "受入メンバー",
  is_member: 1,
  application_id: null,
  responsible_email: "",
  consultation_email: "",
  contact_status: "not_contacted",
  contact_note: "",
  revision: 0,
  first_task_id: null,
  first_task_title: "",
  follow_up_at: null,
};

async function shell(page: Page) {
  await page.route("**/api/admin/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/admin/auth-status")
      return route.fulfill({
        json: {
          email: operatorEmail,
          isManager: false,
          managerProjects: [project.id],
          canAccessAdmin: false,
        },
      });
    if (path === "/api/admin/profile")
      return route.fulfill({
        json: { profile: { display_name: "担当運営者" } },
      });
    if (path === "/api/admin/notifications")
      return route.fulfill({ json: { notifications: [] } });
    return route.fulfill({ status: 403, json: { error: "隔離対象外API" } });
  });
}

const candidates = [
  { email: operatorEmail, displayName: "担当運営者" },
  { email: consultantEmail, displayName: "相談担当者" },
];

test("受入担当・相談先・初回タスクを通知なしで保存し更新revisionを送る", async ({
  page,
}) => {
  await shell(page);
  let saved = false;
  const bodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/admin/member-intake?**", (route) => {
    const request = route.request();
    expect(new URL(request.url()).searchParams.get("project")).toBe(project.id);
    if (request.method() === "PUT") {
      bodies.push(request.postDataJSON());
      saved = true;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        project,
        entries: [
          saved
            ? {
                ...entry,
                responsible_email: operatorEmail,
                consultation_email: consultantEmail,
                contact_status: "contacted",
                first_task_id: "first-task",
                first_task_title: "最初の記事を読む",
                first_task_status: "open",
                first_task_type: "member",
                revision: 1,
              }
            : entry,
        ],
        responsibleCandidates: candidates,
      },
    });
  });
  await page.goto(`admin/member-intake/?project=${project.id}`);
  const card = page.locator("[data-entry]");
  await expect(card).toContainText("受入メンバー");
  await card.locator("[data-responsible]").selectOption(operatorEmail);
  await card.locator("[data-consultation]").selectOption(consultantEmail);
  await card.locator("[data-contact-status]").selectOption("contacted");
  await card.locator("[data-contact-note]").fill("案内の要点を記録しました");
  await card.locator("[data-first-task]").fill("最初の記事を読む");
  await card.getByRole("button", { name: "記録を保存" }).click();
  await expect(card.getByRole("link", { name: /初回タスク/ })).toHaveAttribute(
    "href",
    "/admin/task-detail/?task=first-task",
  );
  expect(bodies[0]).toMatchObject({
    email: memberEmail,
    expectedRevision: 0,
    responsibleEmail: operatorEmail,
    consultationEmail: consultantEmail,
    contactStatus: "contacted",
    contactNote: "案内の要点を記録しました",
    firstTaskTitle: "最初の記事を読む",
  });
  await expect(page.locator("[data-message]")).toContainText(
    "連絡メールや招待は送信していません",
  );
  await card.locator("[data-contact-status]").selectOption("replied");
  await card.getByRole("button", { name: "記録を保存" }).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toMatchObject({
    expectedRevision: 1,
    firstTaskTitle: "",
    contactStatus: "replied",
  });
});

test("古い受入保存を拒否し検索や他カードの保存でも未保存のメモを保持する", async ({
  page,
}) => {
  await shell(page);
  let puts = 0;
  await page.route("**/api/admin/member-intake?**", (route) => {
    if (route.request().method() === "PUT") {
      puts += 1;
      return puts === 1
        ? route.fulfill({
            status: 409,
            json: {
              error:
                "記録が別の運営者によって更新されています。再読み込みしてください。",
            },
          })
        : route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        project,
        entries: [
          { ...entry, revision: 4 },
          {
            ...entry,
            email: "other@example.test",
            display_name: "他メンバー",
            revision: 2,
          },
        ],
        responsibleCandidates: candidates,
      },
    });
  });
  await page.goto(`admin/member-intake/?project=${project.id}`);
  const own = page.locator(`[data-entry="${memberEmail}"]`);
  await own.locator("[data-contact-note]").fill("未保存の連絡メモ");
  await own.getByRole("button", { name: "記録を保存" }).click();
  await expect(page.locator("[data-message]")).toContainText(
    "再読み込みしてください",
  );
  await expect(own.locator("[data-contact-note]")).toHaveValue(
    "未保存の連絡メモ",
  );
  await page.locator("[data-search]").fill("他メンバー");
  await expect(own).toHaveCount(0);
  await page.locator('[data-entry="other@example.test"] [data-save]').click();
  await expect(page.locator("[data-message]")).toContainText("2名の対応記録");
  await page.locator("[data-search]").fill("");
  await expect(own.locator("[data-contact-note]")).toHaveValue(
    "未保存の連絡メモ",
  );
});

test("応募者・メンバー対応は応募状態と確認予定を日本語で区別する", async ({
  page,
}) => {
  await shell(page);
  await page.route("**/api/admin/member-intake?**", (route) =>
    route.fulfill({
      json: {
        project,
        entries: [
          {
            ...entry,
            email: "applicant@example.test",
            display_name: "応募者",
            is_member: 0,
            application_id: "application-1",
            application_status: "accepted",
            follow_up_at: "2026-11-15T03:00:00.000Z",
          },
          {
            ...entry,
            email: "member@example.test",
            display_name: "参加メンバー",
            is_member: 1,
            application_id: "application-2",
            application_status: "reviewing",
            follow_up_at: "2026-11-10T03:00:00.000Z",
            follow_up_completed_at: "2026-11-10T03:05:00.000Z",
          },
        ],
        responsibleCandidates: candidates,
      },
    }),
  );

  await page.goto(`admin/member-intake/?project=${project.id}`);
  await expect(
    page.getByRole("heading", { name: "応募者・メンバー対応" }),
  ).toBeVisible();

  const applicant = page.locator('[data-entry="applicant@example.test"]');
  await expect(applicant).toContainText("応募：受け入れ済み");
  await expect(applicant.locator(".entry-status")).toHaveText("確認予定あり");
  await expect(
    applicant.locator("label").filter({ hasText: "次回確認予定日時" }),
  ).toBeVisible();
  await expect(
    applicant.getByRole("checkbox", { name: "今回の確認は完了" }),
  ).toBeVisible();

  const completed = page.locator('[data-entry="member@example.test"]');
  await expect(completed).toContainText("応募：確認中");
  await expect(completed.locator(".entry-status")).toHaveText("確認済み");
  await expect(page.locator("[data-entries]")).not.toContainText("accepted");
  await expect(page.locator("[data-entries]")).not.toContainText(
    "次回フォロー",
  );
});

test("本人の参加案内が失敗してもポータルを利用でき、再読込で自分の安全な案内を表示する", async ({
  page,
}) => {
  await shell(page);
  let ownLoads = 0;
  await page.route("**/api/admin/portal?**", (route) =>
    route.fulfill({
      json: {
        projects: [{ ...project, role: "member" }],
        availableProjects: [],
        todos: [],
        notifications: [],
        calendar: { events: [] },
      },
    }),
  );
  await page.route("**/api/admin/my-intake", (route) => {
    ownLoads += 1;
    return ownLoads === 1
      ? route.fulfill({ status: 503, json: { error: "隔離受入障害" } })
      : route.fulfill({
          json: {
            entries: [
              {
                project_name: project.name,
                contact_status: "contacted",
                responsible_name: "担当運営者",
                consultation_name: "相談担当者",
                first_task_id: "operator-task",
                first_task_title: "運営の参加前準備",
                first_task_type: "operator",
                follow_up_at: "2026-11-15T03:00:00.000Z",
              },
            ],
          },
        });
  });
  await page.goto("admin/portal/");
  const card = page.locator("[data-my-intake]");
  await expect(card).toContainText("参加後の案内を読み込めませんでした");
  await expect(page.locator('[data-project-group="member"]')).toContainText(
    project.name,
  );
  await expect(page.locator("[data-portal-error]")).toBeHidden();
  await card.getByRole("button", { name: "参加後の案内を再読み込み" }).click();
  await expect(card).toContainText("相談先：相談担当者");
  await expect(card).toContainText("次回確認予定：");
  await expect(card).not.toContainText("次回フォロー");
  await expect(card).toContainText("参加前の運営準備：運営の参加前準備");
  await expect(card.locator('a[href*="operator-task"]')).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: "参加後の案内を再読み込み" }),
  ).toBeHidden();
  expect(ownLoads).toBe(2);
});
