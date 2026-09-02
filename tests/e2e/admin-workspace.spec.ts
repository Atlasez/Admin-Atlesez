import { expect, test, type Page } from "@playwright/test";

async function mockWorkspaceApi(page: Page) {
  let savedProjectProfile: Record<string, string> | undefined;
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/admin/auth-status") {
      await route.fulfill({
        json: {
          email: "alice@example.com",
          isManager: false,
          managerProjects: [],
        },
      });
      return;
    }
    if (url.pathname === "/api/admin/notifications") {
      await route.fulfill({ json: { notifications: [] } });
      return;
    }
    if (url.pathname === "/api/admin/profile") {
      await route.fulfill({
        json: {
          profile: { display_name: "山田 花子", avatar_url: "" },
        },
      });
      return;
    }
    if (url.pathname === "/api/admin/project-profile") {
      if (request.method() === "PUT") {
        savedProjectProfile = request.postDataJSON() as Record<string, string>;
        await route.fulfill({
          json: { ok: true, approvalRequired: true },
        });
        return;
      }
      await route.fulfill({
        json: {
          project: { id: "atlas", name: "アトラス", role: "member" },
          memberProfile: {
            display_name: "山田 花子",
            avatar_url: "",
            university: "既存大学 既存学部",
            year: "M1",
          },
          projectProfile: { internal_bio: "既存の運営内自己紹介" },
          profileChangeRequest: null,
          assignments: ["運営メンバー", "数学担当"],
        },
      });
      return;
    }
    if (url.pathname === "/api/admin/personal-workspace") {
      await route.fulfill({
        json: {
          email: "alice@example.com",
          privateNote: "",
          privateNoteUpdatedAt: null,
          documents: [
            {
              id: "doc-1",
              subject: "mathematics",
              category: "algebra",
              title: "担当中の原稿",
              status: "draft",
              updated_at: "2026-08-20T00:00:00.000Z",
              published_at: null,
            },
          ],
        },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "not found" } });
  });
  return () => savedProjectProfile;
}

test("プロジェクト側マイページで運営内自己紹介と担当を確認・申請できる", async ({
  page,
}) => {
  const getSavedProjectProfile = await mockWorkspaceApi(page);
  await page.goto("admin/workspace/?project=atlas");

  await expect(page.getByText("数学担当", { exact: true })).toBeVisible();
  await expect(page.getByLabel("運営内自己紹介")).toHaveValue(
    "既存の運営内自己紹介",
  );
  await expect(page.locator('input[name="displayName"]')).toHaveCount(0);
  await expect(page.locator('input[name="university"]')).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "共通の基本情報を確認・変更する" }),
  ).toHaveAttribute("href", "/admin/member-profile/");

  await page.getByLabel("運営内自己紹介").fill("更新後の運営内自己紹介");
  await page.getByRole("button", { name: "変更を承認申請" }).click();
  await expect(page.locator("[data-profile-message]")).toContainText(
    "運営事務局へ承認申請を送りました",
  );
  expect(getSavedProjectProfile()).toMatchObject({
    projectId: "atlas",
    internalBio: "更新後の運営内自己紹介",
  });

  const heights = await page.locator(".workspace-grid").evaluate(() => {
    const card = document.querySelector<HTMLElement>(".document-card")!;
    const note = document.querySelector<HTMLElement>(".personal-note")!;
    const documents = document.querySelector<HTMLElement>(".my-documents")!;
    return {
      card: card.getBoundingClientRect().height,
      note: note.getBoundingClientRect().height,
      documents: documents.getBoundingClientRect().height,
    };
  });
  expect(heights.card).toBeLessThan(140);
  expect(heights.documents).toBeLessThan(heights.note);
});

test("運営内自己紹介一覧はプロジェクトの承認済み情報を表示する", async ({
  page,
}) => {
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({
      json: {
        email: "alice@example.com",
        isManager: false,
        managerProjects: [],
      },
    }),
  );
  await page.route("**/api/admin/notifications", (route) =>
    route.fulfill({ json: { notifications: [] } }),
  );
  await page.route("**/api/admin/profile", (route) =>
    route.fulfill({ json: { profile: { display_name: "山田 花子" } } }),
  );
  await page.route("**/api/admin/project-introductions?**", (route) =>
    route.fulfill({
      json: {
        project: { id: "atlas", name: "アトラス" },
        entries: [
          {
            display_name: "山田 花子",
            university: "既存大学",
            year: "M1",
            internal_bio: "数学の記事編集を担当しています。",
            assignments: ["運営メンバー", "数学担当"],
          },
        ],
      },
    }),
  );

  await page.goto("admin/introductions/?project=atlas");
  await expect(page.getByRole("heading", { name: "山田 花子" })).toBeVisible();
  await expect(
    page.getByText("数学の記事編集を担当しています。"),
  ).toBeVisible();
  await expect(page.getByText("数学担当", { exact: true })).toBeVisible();
});

test("プロジェクト運営は運営内自己紹介を承認・却下できる", async ({ page }) => {
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({
      json: {
        email: "manager@example.com",
        isManager: false,
        managerProjects: ["atlas"],
      },
    }),
  );
  await page.route("**/api/admin/notifications", (route) =>
    route.fulfill({ json: { notifications: [] } }),
  );
  await page.route("**/api/admin/profile", (route) =>
    route.fulfill({ json: { profile: { display_name: "承認担当" } } }),
  );
  let action = "";
  await page.route(
    "**/api/admin/project-profile-change-requests/*",
    async (route) => {
      action = (route.request().postDataJSON() as { action: string }).action;
      await route.fulfill({ json: { ok: true, status: action } });
    },
  );
  await page.route("**/api/admin/profile-change-requests?**", (route) =>
    route.fulfill({
      json: {
        requests: [],
        atlasInternalBioRequests: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            email: "member@example.com",
            display_name: "申請メンバー",
            current_internal_bio: "変更前",
            proposed_internal_bio: "変更後",
            status: "pending",
            submitted_at: "2026-08-22T10:00:00.000Z",
          },
        ],
      },
    }),
  );

  await page.goto("admin/profile-requests/?section=atlas");
  await expect(page.getByText("変更後", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "承認する", exact: true }).click();
  await expect.poll(() => action).toBe("approve");
});

test("各ジャンル概要で現行の分野・カテゴリ情報を確認できる", async ({
  page,
}) => {
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({ json: { email: "manager@example.com", isManager: true } }),
  );
  await page.route("**/api/admin/notifications", (route) =>
    route.fulfill({ json: { notifications: [] } }),
  );
  await page.route("**/api/admin/profile", (route) =>
    route.fulfill({ json: { profile: { display_name: "管理者" } } }),
  );
  await page.goto("admin/genres/");
  await expect(
    page.getByRole("heading", { name: "各ジャンル概要" }),
  ).toBeVisible();
  await expect(page.getByText("カテゴリ数").first()).toBeVisible();
  await expect(page.locator(".genre-grid article").first()).toBeVisible();
});

test("各ジャンル概要で担当メンバーと進捗を確認・更新できる", async ({
  page,
}) => {
  await page.route("**/api/admin/auth-status", (route) =>
    route.fulfill({ json: { email: "manager@example.com", isManager: true } }),
  );
  await page.route("**/api/admin/notifications", (route) =>
    route.fulfill({ json: { notifications: [] } }),
  );
  await page.route("**/api/admin/profile", (route) =>
    route.fulfill({ json: { profile: { display_name: "管理者" } } }),
  );
  let savedProgress = "";
  await page.route("**/api/admin/genre-overviews?**", async (route) => {
    if (route.request().method() === "PUT") {
      savedProgress = (route.request().postDataJSON() as { progress: string })
        .progress;
      await route.fulfill({
        json: {
          subject: "mathematics",
          progress: savedProgress,
          updatedAt: "2026-09-02T12:00:00.000Z",
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        scope: { coordinatorSubjects: [] },
        canEditAll: true,
        members: [
          {
            display_name: "山田 花子",
            role: "member",
            assignments: ["運営メンバー", "数学担当"],
          },
        ],
        overviews: [
          {
            subject: "mathematics",
            progress: "集合論の記事を確認中",
            updated_at: "2026-09-01T12:00:00.000Z",
          },
        ],
      },
    });
  });

  await page.goto("admin/genres/");
  const mathematics = page.locator("#mathematics");
  await expect(
    mathematics.getByText("山田 花子", { exact: true }),
  ).toBeVisible();
  await expect(
    mathematics.getByText("小林 和真", { exact: true }),
  ).toBeVisible();
  await expect(
    mathematics.getByText("集合論の記事を確認中", { exact: true }),
  ).toBeVisible();
  await mathematics
    .locator("[data-progress-input]")
    .fill("線形代数の記事を執筆中");
  await mathematics.getByRole("button", { name: "進捗を保存" }).click();
  await expect(
    mathematics.getByText("線形代数の記事を執筆中", { exact: true }),
  ).toBeVisible();
  expect(savedProgress).toBe("線形代数の記事を執筆中");
});
