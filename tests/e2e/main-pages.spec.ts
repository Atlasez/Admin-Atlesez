import { test, expect } from "@playwright/test";

/**
 * 主要画面のE2Eテスト。ビルド済みサイト（astro preview）に対して実行する。
 * 実行前に `npm run build` が必要。
 */

test.describe("公式サイト", () => {
  test("ホームに理念とナビゲーションが表示される", async ({ page }) => {
    await page.goto("./");
    await expect(page.locator("h1")).toContainText("未来の学びを創る。");
    await expect(page.locator("h1")).toContainText("学びで未来を創る。");
    await expect(
      page.getByRole("link", { name: "学習サイト アトラス" }).first(),
    ).toBeVisible();
  });

  test("理念と組織構成を掲載する", async ({ page }) => {
    await page.goto("about/philosophy/");
    await expect(page.locator(".goal-list li")).toHaveCount(12);
    await expect(page.getByText("全ての人に開かれた学びを")).toBeVisible();

    await page.goto("about/organization/");
    await expect(page.getByAltText(/Atlasezの運営事務局/)).toBeVisible();
    await expect(page.getByAltText(/代表と副代表/)).toBeVisible();
  });

  test("プロジェクト一覧に学習サイトが載っている", async ({ page }) => {
    await page.goto("projects/");
    await expect(
      page.getByRole("link", { name: /学習サイト「アトラス」/ }),
    ).toBeVisible();
  });

  test("お知らせの個別ページが開ける", async ({ page }) => {
    await page.goto("news/");
    await page.getByRole("link", { name: /ベータ版を公開/ }).click();
    await expect(page.locator("h1")).toContainText("ベータ版");
  });
});

test.describe("学習サイト", () => {
  test("総合ホームに分野と準備中の区別がある", async ({ page }) => {
    await page.goto("atlas/ja/");
    await expect(page.getByRole("link", { name: "数学" })).toBeVisible();
    await expect(page.getByText("準備中").first()).toBeVisible();
  });

  test("はじめての方へは専用ガイドに移動する", async ({ page }) => {
    await page.goto("atlas/ja/");
    await page.getByRole("link", { name: "はじめての方へ" }).click();
    await expect(page).toHaveURL(/\/atlas\/ja\/guide\/$/);
    await expect(page.locator("h1")).toHaveText("はじめての方へ");
  });

  test("本文準備中の目次項目を記事一覧に表示する", async ({ page }) => {
    await page.goto("atlas/ja/mathematics/set-theory/");
    await expect(
      page.getByText("すべての数学の土台。集合・写像・関係を扱う。"),
    ).toHaveCount(0);
    const planned = page
      .locator(".planned-article")
      .filter({ hasText: "集合族" });
    await expect(planned).toBeVisible();
    await expect(planned).toContainText("準備中");
    await expect(planned.getByRole("link")).toHaveCount(0);
  });

  test("分野の目次にジャンル紹介文を表示しない", async ({ page }) => {
    await page.goto("atlas/ja/mathematics/");
    await expect(
      page.getByText("すべての数学の土台。集合・写像・関係を扱う。"),
    ).toHaveCount(0);
    await expect(
      page.getByText("対称性を記述する代数系。定義から準同型定理まで。"),
    ).toHaveCount(0);
  });

  test("記事ページに目次・前提記事が表示される", async ({ page }) => {
    await page.goto("atlas/ja/mathematics/group-theory/group-definition/");
    await expect(page.locator("h1")).toContainText("群の定義");
    await expect(page.getByRole("navigation", { name: "目次" })).toBeVisible();
    await expect(page.getByText("前提記事")).toBeVisible();
    await expect(page.getByText("査読状況", { exact: true })).toHaveCount(0);
    await expect(page.getByText("未査読", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "参考文献" })).toBeVisible();
    await expect(page.getByText("事前演習（準備中）")).toHaveCount(0);
  });

  test("グリッド／リスト表示を切り替えられる", async ({ page }) => {
    await page.goto("atlas/ja/mathematics/set-theory/");
    const list = page.locator(".article-collection");
    await expect(list).toHaveAttribute("data-view", "grid");
    await page.getByRole("button", { name: "リスト" }).click();
    await expect(list).toHaveAttribute("data-view", "list");
    // 設定が保存される（リロード後も維持）
    await page.reload();
    await expect(list).toHaveAttribute("data-view", "list");
  });

  test("学習地図の代替表示（リスト・表・経路フォーム）がJSなしでも存在する", async ({
    page,
  }) => {
    await page.goto("atlas/ja/map/");
    await expect(
      page.getByText("リスト表示（グラフの代替）", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("表形式", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/目的地点/)).toBeVisible();
  });

  test("学習ルートを計算できる（線形空間→ジョルダン標準形）", async ({
    page,
  }) => {
    await page.goto("atlas/ja/map/");
    await page.locator("[data-route-subject]").selectOption({ label: "数学" });
    await page.getByLabel(/開始地点/).selectOption({ label: "線形空間" });
    await page
      .getByLabel(/目的地点/)
      .selectOption({ label: "ジョルダン標準形" });
    await page.getByRole("button", { name: "経路を表示" }).click();
    const result = page.locator("[data-route-result]");
    await expect(result).toContainText("固有値");
    await expect(result).toContainText("ジョルダン標準形");
    await expect(result).not.toContainText("写像の定義");
    await expect(result.getByRole("listitem")).toHaveCount(8);
    await expect(result).toContainText("同じ分野からあわせて読む（4件）");
    await expect(result).toContainText("開始地点以前の前提（4件）");
  });

  test("検索結果には編集済みの要約を表示する", async ({ page }) => {
    await page.goto("atlas/ja/search/");
    // ヘッダーにも検索欄があるので、検索ページ本体のフォームに限定する
    const searchForm = page.locator("[data-search-form]");
    await searchForm.getByRole("searchbox").fill("群");
    await searchForm.getByRole("button", { name: "検索" }).click();
    const results = page.locator("[data-search-results]");
    await expect(results).toContainText("数学記事です");
    await expect(results).not.toContainText("math.group-theory");
    await expect(page.locator("[data-search-count]")).toContainText("件の記事");
  });

  test("スマートフォンではメニューを開いて移動できる", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("atlas/ja/");
    const menu = page.getByRole("button", { name: "メニュー" });
    const mainNav = page.locator("#atlas-main-nav");
    await expect(menu).toBeVisible();
    await expect(
      mainNav.getByRole("link", { name: "学習リスト" }),
    ).not.toBeVisible();
    await menu.click();
    await expect(
      mainNav.getByRole("link", { name: "学習リスト" }),
    ).toBeVisible();
  });

  test("表示設定が保存される", async ({ page }) => {
    await page.goto("atlas/ja/");
    // 表示設定はヘッダーのメニュー1か所に集約されている
    await page.locator("[data-settings-menu] > summary").click();
    await page.getByLabel("特大").check();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute(
      "data-pref-font-size",
      "xlarge",
    );
  });
});

test.describe("キーボード操作", () => {
  test("Skip to content が最初のフォーカスで現れる", async ({ page }) => {
    await page.goto("./");
    await page.keyboard.press("Tab");
    await expect(page.locator(".skip-link")).toBeFocused();
  });
});
