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

  test("組織サイトに運営紹介を掲載する", async ({ page }) => {
    await page.goto("about/");
    await page.getByRole("link", { name: "運営紹介" }).click();
    await expect(page).toHaveURL(/\/about\/members\/$/);
    await expect(page.locator("h1")).toHaveText("運営紹介");
    await expect(page.locator("[data-member]")).toHaveCount(98);
    await expect(page.getByText("釜口 悠太", { exact: true })).toBeVisible();
    await expect(page.locator(".member-row details")).toHaveCount(0);
    await expect(
      page
        .locator("[data-member]")
        .filter({ hasText: "福山 月" })
        .getByText(/iGEM/),
    ).toBeVisible();

    await page.getByLabel("プロジェクト").selectOption("cafe");
    await expect(page.locator("[data-member]:visible")).toHaveCount(4);
    await expect(page.locator("[data-member-count]")).toHaveText("4名を表示");
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
    /*
      「数学」を役割と名前だけで引くと、隣の丸囲み ? （名前は「数学とは」）や
      リスト表示側の同名リンクにも当たってしまう。タイルのリンクだと分かる
      class で絞る。
    */
    const mathTile = page.locator("a.subject-link", { hasText: "数学" });
    await expect(mathTile).toBeVisible();
    await expect(mathTile).toHaveAttribute(
      "href",
      /\/atlas\/ja\/mathematics\//,
    );
    await expect(page.getByText("準備中").first()).toBeVisible();
  });

  test("はじめての方へは専用ガイドに移動する", async ({ page }) => {
    await page.goto("atlas/ja/");
    const guide = page.getByRole("link", { name: "はじめての方へ" });
    await expect(guide).toHaveCSS("background-color", "rgb(23, 110, 166)");
    await expect(guide).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(
      page
        .locator("header")
        .getByRole("link", { name: "Atlasez", exact: true }),
    ).toHaveCount(0);
    const settings = page.locator("[data-settings-menu] > summary");
    await expect(settings).toHaveCSS("cursor", "pointer");
    expect(
      await settings.evaluate((element) =>
        getComputedStyle(element, "::before").content.replaceAll('"', ""),
      ),
    ).toBe("Aa");
    expect(
      await settings.evaluate((element) =>
        parseFloat(getComputedStyle(element, "::after").borderTopWidth),
      ),
    ).toBeGreaterThan(0);

    await guide.click();
    await expect(page).toHaveURL(/\/atlas\/ja\/guide\/$/);
    await expect(page.locator("h1")).toHaveText("はじめての方へ");
  });

  test("最近更新された記事を近日公開予定より先に表示する", async ({ page }) => {
    await page.goto("atlas/ja/");
    await expect(page.locator("aside.recent h2")).toHaveText([
      "最近更新された記事",
      "近日公開予定の記事",
    ]);
    await expect(page.locator(".recent-scroll")).toHaveCSS(
      "overflow-y",
      "scroll",
    );
    await expect(page.locator(".upcoming-list")).toHaveCSS(
      "overflow-y",
      "scroll",
    );
  });

  test("総合リストを記事まで段階的に展開できる", async ({ page }) => {
    await page.goto("atlas/ja/?view=list");
    await expect(page.locator(".list-group[open]")).not.toHaveCount(0);

    const natural = page.locator(".list-group", { hasText: "自然科学" });
    const mathGenre = natural.locator(".list-genre", { hasText: "数理・情報" });
    await expect(mathGenre).toHaveAttribute("open", "");

    const mathematics = mathGenre.locator(".subject-list-details", {
      has: page.getByRole("link", { name: "数学", exact: true }),
    });
    await expect(
      mathematics.getByRole("link", { name: "数学", exact: true }),
    ).toHaveAttribute("href", /\/mathematics\/\?view=list$/);
    await expect(mathematics).toHaveAttribute("open", "");

    const groupTheory = mathematics.locator(".category-list-details", {
      has: page.getByRole("link", { name: "群論", exact: true }),
    });
    await expect(
      groupTheory.getByRole("link", { name: "群論", exact: true }),
    ).toHaveAttribute("href", /\/group-theory\/\?view=list$/);
    await expect(
      page.getByRole("link", { name: "群の定義", exact: true }),
    ).not.toBeVisible();
    await groupTheory.locator(":scope > summary").click();
    await expect(
      page.getByRole("link", { name: "群の定義", exact: true }),
    ).toBeVisible();
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

  test("各分野トップでタイル・学習地図・リストを切り替えられる", async ({
    page,
  }) => {
    await page.goto("atlas/ja/mathematics/");

    await expect(page.getByRole("tab", { name: "タイル表示" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByRole("link", { name: /集合論.*記事/ }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "学習地図" }).click();
    await expect(page.locator("[data-view-panel='map']")).toBeVisible();
    // 分野トップでは地図が対象分野に固定され、冗長な分野プルダウンは表示しない。
    await expect(page.locator("[data-map-subject]")).toHaveCount(0);

    await page.getByRole("tab", { name: "リスト表示" }).click();
    await expect(page.locator(".toc-category-details[open]")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "群の定義", exact: true }),
    ).not.toBeVisible();

    const groupTheory = page.locator("[data-category='group-theory']");
    await groupTheory.locator("summary").click();
    await expect(groupTheory).toHaveAttribute("open", "");
    await expect(
      page.getByRole("link", { name: "群の定義", exact: true }),
    ).toBeVisible();

    await page.reload();
    await expect(page.getByRole("tab", { name: "リスト表示" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
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
    await expect(page.getByText("この記事の問題を報告")).toBeVisible();
    await expect(page.getByLabel("報告の種類")).toBeVisible();
    await expect(page.getByLabel("内容")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "報告を送信" }),
    ).toBeVisible();
  });

  test("数学記事の証明を一括で開閉できる", async ({ page }) => {
    await page.goto("atlas/ja/mathematics/group-theory/group-definition/");
    const toggle = page.locator("[data-proof-toggle]");
    const proofs = page.locator("details.proof-details");
    const openProofs = page.locator("details.proof-details[open]");
    await expect(toggle).toBeVisible();
    await expect(proofs).not.toHaveCount(0);
    await expect(openProofs).toHaveCount(0);
    await toggle.click();
    await expect(openProofs).toHaveCount(await proofs.count());
    await expect(toggle).toHaveText("証明を閉じる");
    await toggle.click();
    await expect(openProofs).toHaveCount(0);
    await expect(toggle).toHaveText("証明を展開");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(toggle).toHaveCSS("position", "static");
  });

  test("学習記録は触れた位置へ移動し、記事の上下で同期する", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("atlas/ja/biology/overview/what-is-biology/");
    const histories = page.getByRole("slider", { name: "学習の記録" });
    const history = histories.first();
    const bottomHistory = histories.last();

    await expect(histories).toHaveCount(2);
    await expect(history).toHaveCSS("width", "120px");

    await expect(history).toHaveAttribute("aria-valuenow", "0");
    await expect(history).toHaveAttribute("aria-valuetext", "未記録");

    const expectThumbAlignedWithPosition = async (positionIndex: number) => {
      await expect
        .poll(() =>
          history.evaluate((toggle, index) => {
            const thumb = toggle.querySelector(".history-stage-thumb");
            const positions = toggle.querySelectorAll(
              ".history-stage-position",
            );
            const thumbRect = thumb?.getBoundingClientRect();
            const positionRect = positions[index]?.getBoundingClientRect();
            const thumbCenter = thumbRect
              ? thumbRect.left + thumbRect.width / 2
              : NaN;
            const positionCenter = positionRect
              ? positionRect.left + positionRect.width / 2
              : NaN;
            return Math.abs(thumbCenter - positionCenter);
          }, positionIndex),
        )
        .toBeLessThan(0.5);
    };

    await expectThumbAlignedWithPosition(0);

    // ラベルや周囲ではなく、スイッチ本体だけを押せる
    await page
      .locator(".history-stage-labels")
      .first()
      .getByText("理解した", { exact: true })
      .click();
    await expect(history).toHaveAttribute("aria-valuenow", "0");

    await history.click({ position: { x: 60, y: 15 } });
    await expect(history).toHaveAttribute("aria-valuenow", "1");
    await expect(history).toHaveAttribute("aria-valuetext", "読んだ");
    await expect(bottomHistory).toHaveAttribute("aria-valuetext", "読んだ");
    await expectThumbAlignedWithPosition(1);

    await history.click({ position: { x: 116, y: 15 } });
    await expect(history).toHaveAttribute("aria-valuenow", "2");
    await expect(history).toHaveAttribute("aria-valuetext", "理解した");
    await expect(bottomHistory).toHaveAttribute("aria-valuetext", "理解した");
    await expectThumbAlignedWithPosition(2);

    // 「理解した」は集計上「読んだ」にも到達済みとして扱われる
    await page.reload();
    await expect(history).toHaveAttribute("aria-valuetext", "理解した");

    await bottomHistory.click({ position: { x: 4, y: 15 } });
    await expect(history).toHaveAttribute("aria-valuetext", "未記録");
  });

  test("カテゴリトップでタイル・学習地図・リストを切り替えられる", async ({
    page,
  }) => {
    await page.goto("atlas/ja/mathematics/group-theory/");
    const list = page.locator(".article-collection");
    await expect(page.getByRole("tab", { name: "タイル表示" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(list).toHaveAttribute("data-view", "grid");
    await expect(page.getByRole("link", { name: "記事を読む" })).toHaveCount(0);
    await expect(
      page.locator(".article-item").filter({
        has: page.getByRole("link", { name: "群の定義", exact: true }),
      }),
    ).toHaveCSS("position", "relative");

    await page.getByRole("tab", { name: "学習地図" }).click();
    await expect(page.locator("[data-map-view-panel]")).toBeVisible();
    await expect(page.locator("[data-map-subject]")).toHaveCount(0);

    await page.getByRole("tab", { name: "リスト表示" }).click();
    await expect(list).toHaveAttribute("data-view", "list");
    // 設定が保存される（リロード後も維持）
    await page.reload();
    await expect(list).toHaveAttribute("data-view", "list");
  });

  test("経路検索は地図の枠内のボタンから開く", async ({ page }) => {
    await page.goto("atlas/ja/map/");
    const zoomLevel = page.locator("[data-map-zoom-level]");
    await expect(zoomLevel).toBeVisible();
    await expect(page.getByRole("button", { name: "自動整列" })).toBeVisible();
    await expect(page.locator("[data-map-status]")).not.toHaveText("");
    const [actionToolsBox, mapCanvasBox] = await Promise.all([
      page.locator(".map-action-tools").boundingBox(),
      page.locator("#learning-map").boundingBox(),
    ]);
    // 全画面・共有などの操作はキャンバスに重ねず、ツールバー内に収める。
    expect(
      (actionToolsBox?.y ?? 0) + (actionToolsBox?.height ?? 0),
    ).toBeLessThanOrEqual(mapCanvasBox?.y ?? 0);
    const initialZoom = Number(
      (await zoomLevel.textContent())?.replace("%", ""),
    );
    await page.getByRole("button", { name: "拡大" }).click();
    await expect
      .poll(async () =>
        Number((await zoomLevel.textContent())?.replace("%", "")),
      )
      .toBeGreaterThan(initialZoom);

    // 記事・概念の検索は上部の共通検索欄へ統一し、地図内に個別検索欄は置かない。
    await expect(page.locator("[data-map-search]")).toHaveCount(0);

    const open = page.getByRole("button", { name: "学習ルート検索" });
    // 枠の外に箱を並べず、押したときだけ枠内にパネルを出す
    await expect(page.getByLabel(/目的地点/)).not.toBeVisible();
    await open.click();
    await expect(page.getByLabel(/目的地点/)).toBeVisible();
    await expect(open).toHaveAttribute("aria-expanded", "true");
    // 経路検索は canvas の上に重ねず、独立して操作できる位置に置く。
    const routePanel = page.locator("[data-route-panel]");
    const canvas = page.locator("#learning-map");
    await expect(routePanel).toHaveCSS("position", "relative");
    const [routeBox, canvasBox] = await Promise.all([
      routePanel.boundingBox(),
      canvas.boundingBox(),
    ]);
    expect(routeBox?.y).toBeLessThan(canvasBox?.y ?? 0);
    expect((routeBox?.y ?? 0) + (routeBox?.height ?? 0)).toBeLessThanOrEqual(
      canvasBox?.y ?? 0,
    );
    await page.keyboard.press("Escape");
    await expect(page.getByLabel(/目的地点/)).not.toBeVisible();
  });

  test("スマートフォンでは学習地図とページスクロールを切り替えられる", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("atlas/ja/map/");

    const canvas = page.locator("[data-map-frame] .map-canvas");
    const touchToggle = page.getByRole("button", { name: "地図を操作" });
    await expect(touchToggle).toBeVisible();
    await expect(touchToggle).toHaveAttribute("aria-pressed", "false");
    await expect(canvas).toHaveCSS("touch-action", "pan-y pinch-zoom");

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox?.height).toBeGreaterThanOrEqual(500);
    const zoom = Number(
      (await page.locator("[data-map-zoom-level]").textContent())?.replace(
        "%",
        "",
      ),
    );
    expect(zoom).toBeGreaterThanOrEqual(60);

    await touchToggle.click();
    await expect(
      page.getByRole("button", { name: "ページスクロールに戻す" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(canvas).toHaveCSS("touch-action", "none");

    const frame = page.locator("[data-map-frame]");
    expect(
      await frame.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
  });

  test("学習ルートを計算できる（線形空間→ジョルダン標準形）", async ({
    page,
  }) => {
    await page.goto("atlas/ja/map/");
    await page.getByRole("button", { name: "学習ルート検索" }).click();
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
    await expect(page.locator("[data-map-status]")).toContainText(
      "学習経路を表示中",
    );
  });

  test("地図上で選んだノードを経路の始点・終点にできる", async ({ page }) => {
    await page.goto("atlas/ja/map/");
    await page.getByRole("button", { name: "学習ルート検索" }).click();
    await page
      .locator("[data-route-start]")
      .selectOption({ label: "群の定義" });
    await page
      .locator("[data-route-goal]")
      .selectOption({ label: "Schurの補題" });
    await page.getByRole("button", { name: "経路を表示" }).click();

    await expect(page.locator("[data-route-result]")).toContainText(
      "Schurの補題",
    );
    await expect(page.locator("[data-map-status]")).toContainText(
      "学習経路を表示中",
    );
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

  test("スマートフォンでも行き先が畳まれずに出ている", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("atlas/ja/");
    const mainNav = page.locator("#atlas-main-nav");
    // ロゴをホーム導線にし、重複する「分野」は廃止。残る主要導線と検索欄を最初から見せる
    await expect(mainNav.getByRole("link", { name: "分野" })).toHaveCount(0);
    for (const name of ["学習リスト", "はじめての方へ"]) {
      await expect(mainNav.getByRole("link", { name })).toBeVisible();
    }
    await expect(page.locator("#header-search-input")).toBeVisible();
    await expect(page.getByRole("button", { name: "メニュー" })).toHaveCount(0);
  });

  test("表示設定が保存される", async ({ page }) => {
    await page.goto("atlas/ja/");
    // 表示設定はヘッダーのメニュー1か所に集約されている
    const menu = page.locator("[data-settings-menu]");
    await page.locator("[data-settings-menu] > summary").click();
    await expect(menu).toHaveAttribute("open", "");
    /*
      ラジオの丸は隠して選択肢そのものを押せる面にしているため、
      input は見えない。利用者と同じくラベルの面を押す。
    */
    const xlarge = menu.locator("label.a11y-option", { hasText: "特大" });
    await expect(xlarge).toBeVisible();
    await xlarge.click();
    const language = menu.locator('select[name="lang"]');
    await language.selectOption("en");
    await expect(language.locator('option[value="ja"]')).toHaveText(
      "日本語(Japanese)",
    );
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
