import { expect, test, type Page } from "@playwright/test";

const seminar = {
  number: 32,
  title: "リーマン面ゼミ",
  recruitment: "open",
  phase: "active",
  acceptingApplications: true,
  details: {
    theme: "リーマン面",
    level: "複素解析を学んだ方",
    purpose: "リーマン面の基礎を学ぶ",
    description: "Forsterのテキストを読み進めます。",
    goals: "第2章までを読む",
    method: "参加者で輪読します。",
    materials: "Forster, Lectures on Riemann Surfaces",
    prerequisites: "複素解析",
    conditions: "学生",
    observation: "事前に相談してください。",
    lateJoin: "途中参加できます。",
    schedule: "毎週金曜日",
    period: "2026年中",
    frequency: "週1回",
    format: "対面",
    venue: "早稲田大学",
    currentSize: "5人",
    capacity: "10人",
    organizer: "Wathematica有志",
    remarks: "初学者歓迎",
  },
};

const apiRoute = (path: string) =>
  `https://admin.atlasez.org/api/seminars${path}`;
const cors = (origin: string | undefined) => ({
  "access-control-allow-origin": origin ?? "http://localhost:4321",
  "access-control-allow-credentials": "true",
});

async function mockSession(page: Page) {
  await page.route(apiRoute("/session"), (route) =>
    route.fulfill({
      json: { signedIn: true, email: "member@example.test", canReview: false },
      headers: cors(route.request().headers().origin),
    }),
  );
}

test("ゼミ一覧を検索し、詳細に公開項目を表示する", async ({ page }) => {
  await page.route(apiRoute("/session"), (route) =>
    route.fulfill({
      json: { signedIn: false, canReview: false },
      headers: cors(route.request().headers().origin),
    }),
  );
  await page.route(apiRoute(""), (route) =>
    route.fulfill({
      json: {
        seminars: [
          seminar,
          {
            ...seminar,
            number: 9,
            title: "多様体の基礎ゼミ",
            details: { ...seminar.details, theme: "多様体" },
          },
        ],
      },
      headers: cors(route.request().headers().origin),
    }),
  );

  await page.goto("seminars/");
  await expect(page.getByRole("heading", { name: "ゼミ一覧" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "リーマン面ゼミ" }),
  ).toBeVisible();
  await expect(page.locator("[data-catalog-count]")).toHaveText(
    "2件のゼミを掲載しています。",
  );
  const login = new URL(
    (await page.locator("[data-seminar-login]").getAttribute("href")) ?? "",
  );
  expect(login.origin).toBe("https://admin.atlasez.org");
  expect(login.pathname).toBe("/auth/google/login");
  expect(login.searchParams.get("returnTo")).toBe(
    "https://atlasez.org/seminars/",
  );
  await page.locator("[data-catalog-search]").fill("多様体");
  await expect(page.locator("[data-seminar-card]")).toHaveCount(1);
  await expect(page.locator("[data-seminar-card]")).toContainText(
    "多様体の基礎ゼミ",
  );

  await page.route(apiRoute("/32"), (route) =>
    route.fulfill({
      json: seminar,
      headers: cors(route.request().headers().origin),
    }),
  );
  await page.goto("seminars/detail/?number=32");
  await expect(
    page.getByRole("heading", { name: "リーマン面ゼミ" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "このゼミに参加申請する" }),
  ).toBeVisible();
  for (const label of [
    "目的",
    "内容",
    "到達目標",
    "進め方",
    "教材",
    "前提知識",
    "参加条件・募集範囲",
    "見学の可否",
    "途中参加の可否",
    "開催日時",
    "開催形式",
    "開催場所",
    "定員",
    "主催者（公開名）",
  ])
    await expect(
      page.locator("dt").getByText(label, { exact: true }),
    ).toBeVisible();
});

test("Googleログイン済みの企画者はゼミ企画フォームを送信できる", async ({
  page,
}) => {
  await mockSession(page);
  await page.route(apiRoute("/proposals"), async (route) => {
    const origin = route.request().headers().origin;
    if (route.request().method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          ...cors(origin),
          "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "access-control-allow-headers": "content-type, x-seminar-filename",
        },
      });
    expect(route.request().postDataJSON()).toMatchObject({
      name: "企画者",
      title: "数学ゼミ",
      recruitment: "open",
      theme: "数学",
      operationsNote: "運営への確認事項",
    });
    return route.fulfill({
      json: { number: 33 },
      status: 201,
      headers: cors(origin),
    });
  });

  await page.goto("seminars/propose/");
  await expect(
    page.getByText("member@example.test", { exact: true }),
  ).toBeVisible();
  await page.locator('[name="name"]').fill("企画者");
  await page.locator('[name="title"]').fill("数学ゼミ");
  await page.locator('[name="theme"]').fill("数学");
  await page.locator('[name="level"]').fill("初学者");
  for (const name of [
    "purpose",
    "description",
    "goals",
    "method",
    "materials",
    "prerequisites",
    "conditions",
    "observation",
    "lateJoin",
    "schedule",
    "period",
    "frequency",
    "format",
    "venue",
    "currentSize",
    "capacity",
    "organizer",
  ])
    await page
      .locator(
        name === "description"
          ? 'textarea[name="description"]'
          : `[name="${name}"]`,
      )
      .fill("入力例");
  await page.locator('[name="operationsNote"]').fill("運営への確認事項");
  await page.getByRole("button", { name: "企画を送信する" }).click();
  await expect(
    page.getByRole("heading", { name: "企画を受け付けました" }),
  ).toBeVisible();
  await expect(page.getByText("0000033")).toBeVisible();
});

test("ゼミ参加申請は主催者への連絡を含めて送れる", async ({ page }) => {
  await mockSession(page);
  await page.route(apiRoute("/32"), (route) =>
    route.fulfill({
      json: seminar,
      headers: cors(route.request().headers().origin),
    }),
  );
  await page.route(apiRoute("/dashboard"), (route) =>
    route.fulfill({
      json: { memberships: [], applications: [] },
      headers: cors(route.request().headers().origin),
    }),
  );
  await page.route(apiRoute("/32/join"), async (route) => {
    const origin = route.request().headers().origin;
    if (route.request().method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          ...cors(origin),
          "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "access-control-allow-headers": "content-type, x-seminar-filename",
        },
      });
    expect(route.request().postDataJSON()).toMatchObject({
      name: "参加者",
      hostNote: "途中参加について質問です。",
    });
    return route.fulfill({
      status: 201,
      json: { id: "application-id" },
      headers: cors(origin),
    });
  });

  await page.goto("seminars/join/?number=32");
  await expect(
    page.getByRole("heading", { name: "ゼミ参加フォーム" }),
  ).toBeVisible();
  await page.locator('[name="name"]').fill("参加者");
  await page.locator('[name="hostNote"]').fill("途中参加について質問です。");
  await page.getByRole("button", { name: "参加を申請する" }).click();
  await expect(
    page.getByRole("heading", { name: "参加申請を受け付けました" }),
  ).toBeVisible();
});

test("参加者ページで活動状況を確認し、ゼミ資料をアップロードできる", async ({
  page,
}) => {
  await mockSession(page);
  await page.route(apiRoute("/dashboard"), (route) =>
    route.fulfill({
      json: {
        memberships: [
          { number: 32, title: seminar.title, phase: "active", isHost: true },
        ],
        proposals: [],
        applications: [
          {
            number: 9,
            title: "多様体の基礎ゼミ",
            status: "pending",
            created_at: "2026-11-11T00:00:00.000Z",
            decided_at: null,
            decision_note: "",
          },
        ],
        activities: [
          {
            id: "next-event",
            number: 32,
            seminar_title: seminar.title,
            phase: "active",
            kind: "event",
            title: "次回の輪読",
            description: "第2章を読みます。",
            due_at: "2099-01-01T10:00:00.000Z",
            completed_at: null,
            options: [],
            choice: null,
            assignee: null,
            canComplete: 0,
            counts: {},
          },
          {
            id: "prepare-task",
            number: 32,
            seminar_title: seminar.title,
            phase: "active",
            kind: "task",
            title: "資料を予習する",
            description: "該当箇所を読んでください。",
            due_at: "2099-01-01T09:00:00.000Z",
            completed_at: null,
            options: [],
            choice: null,
            assignee: "参加者",
            canComplete: 0,
            counts: {},
          },
          {
            id: "schedule-poll",
            number: 32,
            seminar_title: seminar.title,
            phase: "active",
            kind: "poll",
            title: "次回候補日",
            description: "都合のよい日を選んでください。",
            due_at: "2099-01-01T08:00:00.000Z",
            completed_at: null,
            options: ["金曜日", "土曜日"],
            choice: null,
            assignee: null,
            canComplete: 0,
            counts: { 0: 1, 1: 0 },
          },
          {
            id: "important-notice",
            number: 32,
            seminar_title: seminar.title,
            phase: "active",
            kind: "notice",
            title: "連絡：教室変更",
            description: "会場が変わりました。",
            due_at: null,
            completed_at: null,
            options: [],
            choice: null,
            assignee: null,
            canComplete: 0,
            counts: {},
          },
        ],
      },
      headers: cors(route.request().headers().origin),
    }),
  );
  let uploaded = false;
  await page.route(apiRoute("/32/workspace"), (route) =>
    route.fulfill({
      json: {
        seminar,
        isHost: true,
        activities: [],
        applications: [],
        materials: uploaded
          ? [
              {
                id: "file-id",
                filename: "handout.txt",
                bytes: 12,
                created_at: "2026-11-12T00:00:00.000Z",
                canManage: 1,
              },
            ]
          : [],
      },
      headers: cors(route.request().headers().origin),
    }),
  );
  await page.route(apiRoute("/32/materials"), async (route) => {
    const origin = route.request().headers().origin;
    if (route.request().method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          ...cors(origin),
          "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "access-control-allow-headers": "content-type, x-seminar-filename",
        },
      });
    expect(route.request().headers()["content-type"]).toBe(
      "application/octet-stream",
    );
    expect(route.request().headers()["x-seminar-filename"]).toBe("handout.txt");
    uploaded = true;
    return route.fulfill({
      status: 201,
      json: { ok: true },
      headers: cors(origin),
    });
  });

  await page.goto("seminars/member/");
  for (const heading of [
    "参加中のゼミ",
    "次回予定",
    "準備・担当",
    "回答待ちの日程調整",
    "重要な連絡",
    "参加申請・企画の状況",
    "過去の活動",
  ])
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await expect(page.getByText("次回の輪読")).toBeVisible();
  await expect(page.getByText("参加申請 ・ 審査待ち")).toBeVisible();
  await page
    .locator('a[href="/seminars/workspace/?number=32"]')
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: seminar.title }),
  ).toBeVisible();
  await page.locator('input[name="file"]').setInputFiles({
    name: "handout.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("seminar handout"),
  });
  await page.getByRole("button", { name: "アップロード" }).click();
  await expect(page.getByRole("link", { name: "handout.txt" })).toBeVisible();
});
