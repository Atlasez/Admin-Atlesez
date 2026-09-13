import { expect, test } from "@playwright/test";

test("役割管理をジャンル管理から分離し、役割の追加・編集・アーカイブを完了できる", async ({
  page,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());
  let catalog = [
    {
      id: "role-1",
      kind: "role",
      slug: "sns",
      name: "SNS担当",
      description: "SNS運用",
      permission_scope: "SNS告知のみ",
      status: "active",
    },
    {
      id: "genre-1",
      kind: "genre",
      slug: "statistics",
      name: "統計",
      description: "データを扱うジャンル",
      permission_scope: "記事の統計分野",
      status: "active",
    },
  ];
  let assignments: Array<{
    catalog_id: string;
    email: string;
    display_name: string;
    avatar_url: string;
  }> = [];
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname === "/api/admin/genre-role-catalog" &&
      route.request().method() === "GET"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ catalog, assignments }),
      });
    }
    if (
      url.pathname === "/api/admin/genre-role-catalog/assignments" &&
      route.request().method() === "POST"
    ) {
      const body = JSON.parse(route.request().postData() ?? "{}");
      assignments = [
        ...assignments,
        {
          catalog_id: body.catalogId,
          email: body.email,
          display_name: "運営メンバー",
          avatar_url: "",
        },
      ];
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    }
    if (
      url.pathname === "/api/admin/genre-role-catalog" &&
      route.request().method() === "POST"
    ) {
      const body = JSON.parse(route.request().postData() ?? "{}");
      const role = {
        id: `role-${catalog.filter((item) => item.kind === "role").length + 1}`,
        kind: "role",
        slug: body.slug || "role-public-relations",
        name: body.name,
        description: body.description,
        permission_scope: body.permissionScope,
        status: "active",
      };
      catalog = [...catalog, role];
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, ...role }),
      });
    }
    if (
      url.pathname === "/api/admin/genre-role-catalog" &&
      route.request().method() === "PATCH"
    ) {
      const body = JSON.parse(route.request().postData() ?? "{}");
      catalog = catalog.map((role) =>
        role.id === body.id
          ? {
              ...role,
              ...body,
              status:
                body.action === "archive"
                  ? "archived"
                  : body.action === "restore"
                    ? "active"
                    : role.status,
            }
          : role,
      );
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    }
    if (url.pathname === "/api/admin/auth-status")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ email: "manager@example.com", isManager: true }),
      });
    if (url.pathname === "/api/admin/profile")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ profile: { display_name: "管理者" } }),
      });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.goto("admin/roles/?project=atlas");
  await expect(
    page.getByRole("heading", { name: "役割管理", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("ジャンル管理", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "SNS担当", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('[data-role-form] input[name="slug"]'),
  ).not.toHaveAttribute("required");
  await expect(
    page.locator("[data-role-form] details.advanced-field"),
  ).toBeVisible();
  await expect(
    page.locator('[data-role-id="role-1"] [data-role-assignment]'),
  ).toBeVisible();
  await page
    .locator(
      '[data-role-id="role-1"] [data-role-assignment] input[name="email"]',
    )
    .fill("member@example.com");
  await page
    .locator('[data-role-id="role-1"] [data-role-assignment]')
    .getByRole("button", { name: "追加", exact: true })
    .click();
  await expect(
    page.locator('[data-role-id="role-1"] .member').first(),
  ).toContainText("運営メンバー");

  await page.locator('[data-role-form] input[name="name"]').fill("広報担当");
  await page
    .locator('[data-role-form] textarea[name="description"]')
    .fill("公開告知");
  await page
    .locator('[data-role-form] textarea[name="permissionScope"]')
    .fill("SNS告知のみ");
  await page.getByRole("button", { name: "役割を追加", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "広報担当", exact: true }),
  ).toBeVisible();

  const card = page.locator('[data-role-id="role-2"]');
  await card.getByRole("button", { name: "編集", exact: true }).click();
  await card
    .locator('[data-role-editor] input[name="name"]')
    .fill("広報・SNS担当");
  await card.locator('[data-role-editor] button[type="submit"]').click();
  await expect(
    page.getByRole("heading", { name: "広報・SNS担当", exact: true }),
  ).toBeVisible();
  await card.getByRole("button", { name: "アーカイブ", exact: true }).click();
  await expect(card.getByText("アーカイブ", { exact: true })).toBeVisible();

  await page.goto("admin/genre-roles/?project=atlas&view=genres");
  await expect(
    page.getByRole("heading", { name: "ジャンル管理", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('[data-catalog-form] input[name="slug"]'),
  ).not.toHaveAttribute("required");
  await expect(
    page.locator("[data-catalog-form] details.advanced-field"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "新しいジャンルを作成", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('[data-catalog-form] option[value="role"]'),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "役割管理", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-custom-id="genre-1"] [data-custom-assignment]'),
  ).toBeVisible();
  await expect(
    page.locator("[data-content] [data-subject-assignment]"),
  ).toHaveCount(0);
  await expect(page.locator("[data-content] .dot--manager")).toHaveCount(0);
  await expect(page.locator("[data-content]")).not.toContainText(
    "全分野管理者",
  );
});

test("旧ジャンル・役割管理の役割ブックマークを役割管理へ移行する", async ({
  page,
}) => {
  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const payload =
      path === "/api/admin/genre-role-catalog"
        ? { catalog: [], assignments: [] }
        : path === "/api/admin/auth-status"
          ? { email: "manager@example.com", isManager: true }
          : path === "/api/admin/profile"
            ? { profile: { display_name: "管理者" } }
            : {};
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });

  await page.goto("admin/genre-roles/?project=atlas&view=roles");
  await expect(page).toHaveURL(/\/admin\/roles\/\?project=atlas$/);
  await expect(
    page.getByRole("heading", { name: "役割管理", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-role-list] .empty-state")).toBeVisible();
  await expect(page.locator("[data-role-list] .loading")).toHaveCount(0);
});
