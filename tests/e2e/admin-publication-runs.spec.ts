import { expect, test } from "@playwright/test";

const emptyPayload = {
  generatedAt: "2026-11-09T00:00:00.000Z",
  counts: {},
  runs: [],
};

const runPayload = (title: string, state: string) => ({
  generatedAt: "2026-11-09T00:00:00.000Z",
  counts: { [state]: 1 },
  runs: [
    {
      id: `run-${state}`,
      document_id: `document-${state}`,
      action: "publish" as const,
      state,
      attempt: 1,
      title,
      subject: "mathematics",
      category: "group-theory",
      slug: "test-article",
      updated_at: "2026-11-09T00:00:00.000Z",
      created_at: "2026-11-09T00:00:00.000Z",
    },
  ],
});

test("公開処理一覧は読み込み終了後に更新できる", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/admin/editor/publication-runs**", (route) => {
    requests += 1;
    return route.fulfill({ json: emptyPayload });
  });

  await page.goto("/admin/publication-runs/");
  const refresh = page.getByRole("button", { name: "更新", exact: true });
  await expect(refresh).toBeEnabled();

  await refresh.click();
  await expect.poll(() => requests).toBe(2);
  await expect(refresh).toBeEnabled();
});

test("公開処理一覧には最後に選択した状態の応答だけを反映する", async ({
  page,
}) => {
  let releasePublishedResponse!: () => void;
  const publishedResponseGate = new Promise<void>((resolve) => {
    releasePublishedResponse = resolve;
  });
  let signalPublishedRequest!: () => void;
  const publishedRequestStarted = new Promise<void>((resolve) => {
    signalPublishedRequest = resolve;
  });
  let signalPublishedResponse!: () => void;
  const publishedResponseFinished = new Promise<void>((resolve) => {
    signalPublishedResponse = resolve;
  });

  await page.route("**/api/admin/editor/publication-runs**", async (route) => {
    const state = new URL(route.request().url()).searchParams.get("state");
    if (state === "published") {
      signalPublishedRequest();
      await publishedResponseGate;
      await route.fulfill({
        json: runPayload("古い公開済み結果", "published"),
      });
      signalPublishedResponse();
      return;
    }
    await route.fulfill({
      json:
        state === "failed"
          ? runPayload("最新の失敗結果", "failed")
          : emptyPayload,
    });
  });

  await page.goto("/admin/publication-runs/");
  const refresh = page.getByRole("button", { name: "更新", exact: true });
  await expect(refresh).toBeEnabled();

  try {
    await page.locator("[data-state-filter]").selectOption("published");
    await publishedRequestStarted;
    await page.locator("[data-state-filter]").selectOption("failed");
    await expect(
      page.locator("[data-list]").getByText("最新の失敗結果", { exact: true }),
    ).toBeVisible();
  } finally {
    releasePublishedResponse();
  }

  await publishedResponseFinished;
  await expect(
    page.locator("[data-list]").getByText("最新の失敗結果", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("[data-list]").getByText("古い公開済み結果", { exact: true }),
  ).toHaveCount(0);
});
