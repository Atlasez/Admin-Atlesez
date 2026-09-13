import { expect, test } from "@playwright/test";

test("権限管理はアクセス定義と監査に限定され、編集導線を専用画面へ分ける", async ({
  page,
}) => {
  let auditRequests = 0;
  await page.route("**/api/admin/permission-audit*", async (route) => {
    auditRequests += 1;
    const url = new URL(route.request().url());
    await route.fulfill({
      json: {
        entries: [
          {
            id: "audit-1",
            actor_email: "admin@example.com",
            target_email: "editor@example.com",
            action: "replace",
            before_subjects: "mathematics",
            after_subjects: "mathematics,physics",
            created_at: "2026-09-12T02:00:00.000Z",
            archived_at:
              url.searchParams.get("includeArchived") === "1"
                ? "2026-09-13T00:00:00.000Z"
                : null,
          },
        ],
        pagination: { hasMore: false, nextCursor: null },
      },
    });
  });

  await page.goto("admin/permissions/?project=atlas");

  await expect(
    page.getByRole("heading", { name: "権限管理", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-permission-management]")).toBeVisible();
  await expect(page.locator(".action-card")).toHaveCount(3);
  await expect(page.locator(".action-card").nth(0)).toHaveAttribute(
    "href",
    "/admin/member-management/?project=atlas",
  );
  await expect(page.locator(".member-card")).toHaveCount(0);
  await expect(page.locator(".member-admin")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("運営者・担当分野管理");
  await expect(page.locator(".audit-entry")).toContainText(
    "editor@example.com",
  );

  await page.locator("[data-include-archived]").check();
  await expect.poll(() => auditRequests).toBe(2);
  await expect(page.locator(".audit-entry")).toContainText("アーカイブ日時");
});

test("権限監査がHTMLエラーを返してもJSON解析せず再試行できる", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/admin/permission-audit*", async (route) => {
    requests += 1;
    if (requests === 1) {
      await route.fulfill({
        status: 502,
        contentType: "text/html",
        body: "<html>upstream failure</html>",
      });
      return;
    }
    await route.fulfill({
      json: {
        entries: [],
        pagination: { hasMore: false, nextCursor: null },
      },
    });
  });

  await page.goto("admin/permissions/?project=atlas");
  const retry = page.locator(
    '[data-admin-load-error-scope="permission-audit"]',
  );
  await expect(retry).toBeVisible();
  await expect(retry).toContainText("権限変更履歴");
  await retry.getByRole("button", { name: "再試行" }).click();
  await expect(page.locator(".audit-list .empty")).toBeVisible();
  expect(requests).toBe(2);
});

test("名簿の編集でプロフィール・記事権限・分野統括を一つの導線から保存する", async ({
  page,
}) => {
  let member = {
    email: "editor@example.com",
    display_name: "編集担当",
    university: "",
    year: "",
    interests: "",
    avatar_url: "",
    membership_role: "member",
    subjects: ["mathematics"],
    workflow_subjects: [],
    workflow_roles: [],
    catalog_assignments: [],
    discord_user_id: "",
    discord_role_ids: [],
    updated_at: "",
  };
  let saved: Record<string, unknown> | null = null;
  await page.route("**/api/admin/member-management*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { members: [member], discord_roles: [] } });
      return;
    }
    saved = JSON.parse(route.request().postData() ?? "{}");
    member = { ...member, ...(saved as typeof member) };
    await route.fulfill({
      json: { ok: true, provisioning: { status: "skipped" } },
    });
  });

  await page.goto("admin/member-management/?project=atlas");
  const card = page.locator(".member-card");
  await expect(card).toContainText("編集担当");
  await card.getByRole("button", { name: "編集" }).click();
  const dialog = page.locator("[data-dialog]");
  await expect(dialog).toBeVisible();
  await dialog.locator("[data-university]").selectOption({ label: "東京大学" });
  await dialog
    .locator("[data-permissions]")
    .selectOption(["mathematics", "physics"]);
  await dialog.locator("[data-workflow]").selectOption(["physics"]);
  await dialog.getByRole("button", { name: "変更を保存" }).click();

  await expect
    .poll(() => saved)
    .toMatchObject({
      email: "editor@example.com",
      subjects: ["mathematics", "physics"],
      university: "東京大学",
    });
  await expect
    .poll(() => saved)
    .toMatchObject({
      workflowSubjects: ["physics"],
    });
});

test("名簿は表形式・履歴・表示名／アイコン編集とアーカイブ復元を提供する", async ({
  page,
}) => {
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });
  let status: "active" | "archived" = "active";
  let saved: Record<string, unknown> | null = null;
  const member = () => ({
    email: "editor@example.com",
    display_name: "編集担当",
    university: "東京大学",
    year: "B1",
    interests: "数学",
    avatar_url: "",
    membership_role: "member",
    subjects: ["mathematics"],
    workflow_subjects: ["physics"],
    workflow_roles: [{ role: "subject-coordinator", subject: "physics" }],
    catalog_assignments: [],
    discord_user_id: "",
    discord_role_ids: [],
    updated_at: "2026-09-13T00:00:00.000Z",
    status,
    projects: [
      {
        project_id: "atlas",
        project_name: "アトラス",
        role: "member",
        joined_at: "2026-09-01T00:00:00.000Z",
      },
    ],
    first_creator: "owner@example.com",
    last_editor: "owner@example.com",
    history_count: 2,
  });
  await page.route("**/api/admin/member-management/history*", async (route) => {
    await route.fulfill({
      json: {
        entries: [
          {
            actor_email: "owner@example.com",
            action: "member_updated",
            summary: "メンバー情報を更新",
            created_at: "2026-09-13T00:00:00.000Z",
          },
        ],
      },
    });
  });
  await page.route("**/api/admin/member-management*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { members: [member()], discord_roles: [] } });
      return;
    }
    if (route.request().method() === "PUT") {
      saved = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        json: { ok: true, provisioning: { status: "skipped" } },
      });
      return;
    }
    if (route.request().method() === "PATCH") {
      const payload = JSON.parse(route.request().postData() ?? "{}");
      status = payload.action === "archive" ? "archived" : "active";
      await route.fulfill({ json: { ok: true, status } });
      return;
    }
    await route.continue();
  });

  await page.goto("admin/member-management/?project=atlas");
  await expect(page.locator(".member-card")).toHaveCount(1);
  await page.getByRole("button", { name: "表形式で表示" }).click();
  await expect(page.locator(".member-table")).toBeVisible();
  await expect(page.locator(".member-table__row")).toContainText(
    "アトラス（member）",
  );
  await page
    .locator(".member-table__row")
    .getByRole("button", { name: "編集" })
    .click();
  await expect(page.locator("[data-history-list]")).toContainText(
    "メンバー情報を更新",
  );
  await page.locator("[data-display-name]").fill("編集担当（更新）");
  await page
    .locator("[data-avatar-url]")
    .fill("https://example.com/avatar.png");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect
    .poll(() => saved)
    .toMatchObject({
      displayName: "編集担当（更新）",
      avatarUrl: "https://example.com/avatar.png",
    });
  await page
    .locator(".member-table__row")
    .getByRole("button", { name: "アーカイブ" })
    .click();
  await expect.poll(() => status).toBe("archived");
  await expect(page.locator(".member-table__row")).toContainText("アーカイブ");
  await page
    .locator(".member-table__row")
    .getByRole("button", { name: "復元" })
    .click();
  await expect.poll(() => status).toBe("active");
});
