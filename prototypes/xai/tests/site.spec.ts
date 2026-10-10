import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/company/",
  "/careers/",
  "/news/",
  "/colossus/",
  "/api/",
  "/pricing/",
  "/grok/",
  "/build/",
  "/bot/",
  "/api/imagine/",
  "/voice/",
  "/news/grok-4-7/",
];

for (const route of routes) {
  test(`renders ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator("footer")).toContainText(
      "Independent interface prototype",
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );
  });
}

test("opens the navigation and changes its category panel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Open navigation" });
  await toggle.click();
  await expect(page.locator("#site-menu")).toBeVisible();
  await page.getByRole("tab", { name: /Company/ }).click();
  await expect(page.locator('[data-menu-panel="company"]')).toBeVisible();
  await expect(page.locator('[data-menu-panel="products"]')).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#site-menu")).toBeHidden();
});

test("opens the desktop mega menu from the primary navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: /Products/ }).click();
  await expect(page.locator("#site-menu")).toBeVisible();
  await expect(page.getByRole("button", { name: /Products/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.getByRole("tab", { name: /Company/ }).click();
  await expect(page.locator('[data-menu-panel="company"]')).toBeVisible();
  await page.getByRole("button", { name: "Close navigation" }).click();
  await expect(page.locator("#site-menu")).toBeHidden();
});

test("recreates the Colossus story and its selectable construction timeline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/colossus/");
  await expect(
    page.getByRole("heading", { name: "Our gigafactory of compute." }),
  ).toBeVisible();
  await expect(page.locator(".colossus-wireframe")).toBeVisible();
  await expect(page.locator(".colossus-site-photo")).toHaveAttribute(
    "alt",
    "Aerial shot of Colossus's site",
  );
  const timeline = page.getByRole("button", {
    name: "September 2024: Training begins",
  });
  await timeline.click();
  await expect(page.locator("[data-timeline-title]")).toHaveText(
    "Training begins",
  );
  await expect(page.locator("[data-timeline-copy]")).toContainText(
    "42K-GPU job",
  );
  await expect(page.locator("[data-timeline-date]")).toHaveText(
    "September 2024",
  );
  await expect(page.locator("[data-timeline-count]")).toHaveText("276");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("counts Colossus metrics into their observed values when scrolled into view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/colossus/");
  const metrics = page.locator("[data-count-end]");
  await metrics.first().scrollIntoViewIfNeeded();
  await expect(metrics.nth(0)).toHaveText("200K");
  await expect(metrics.nth(1)).toHaveText("194");
  await expect(metrics.nth(2)).toHaveText("3.6");
  await expect(metrics.nth(3)).toHaveText(">1");
});

test("renders the observed public news archive and source links", async ({
  page,
}) => {
  await page.goto("/news/");
  await expect(page.locator(".news-card")).toHaveCount(84);
  await expect(
    page.getByRole("heading", { name: "Introducing Grok 4.7" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Introducing Grok/ }).first(),
  ).toHaveAttribute("href", "/news/grok-4-7/");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({
    path: "test-results/news-desktop-1440-fold.png",
    fullPage: false,
    animations: "disabled",
  });
  await page.screenshot({
    path: "test-results/news-archive-desktop-fullpage.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("switches pricing tabs and renders the corresponding plans", async ({
  page,
}) => {
  await page.goto("/pricing/");
  await page.getByRole("tab", { name: "Team" }).click();
  await expect(page.locator("[data-plan-panel]")).toContainText("Business");
  await expect(page.locator("[data-plan-panel]")).toContainText("Enterprise");
  await page.getByRole("tab", { name: "API" }).click();
  await expect(page.locator("[data-plan-panel]")).toContainText("Usage-based");
});

test("keeps product demo controls honest and interactive", async ({ page }) => {
  await page.goto("/api/imagine/");
  await page
    .getByLabel("Describe what you want to generate")
    .fill("A moonlit glass greenhouse");
  await page.getByRole("button", { name: /Generate/ }).click();
  await expect(page.locator("[data-imagine-status]")).toContainText(
    "no API was called",
  );
  await page.goto("/bot/");
  await page.getByRole("tab", { name: "Research" }).click();
  await expect(page.locator("[data-usecase-title]")).toHaveText(
    "Research brief",
  );
});

test("captures stable responsive home screenshots and avoids horizontal overflow", async ({
  page,
}) => {
  const viewports = [
    { width: 1440, height: 900, name: "desktop-1440" },
    { width: 1920, height: 1080, name: "desktop-1920" },
    { width: 768, height: 1024, name: "tablet-768" },
    { width: 390, height: 844, name: "mobile-390" },
    { width: 375, height: 812, name: "mobile-375" },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("body")).toHaveJSProperty(
      "scrollWidth",
      viewport.width,
    );
    if (viewport.name === "desktop-1440") {
      await page.screenshot({
        path: "test-results/home-desktop-1440-fold.png",
        fullPage: false,
        animations: "disabled",
      });
    }
    await page.screenshot({
      path: `test-results/home-${viewport.name}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.goto("/colossus/");
    await expect(page.locator("body")).toHaveJSProperty(
      "scrollWidth",
      viewport.width,
    );
    await page.locator(".colossus-site-photo").scrollIntoViewIfNeeded();
    expect(
      await page
        .locator(".colossus-site-photo")
        .evaluate(async (image: HTMLImageElement) => {
          await image.decode();
          return image.naturalWidth > 0;
        }),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    if (viewport.name === "desktop-1440") {
      await page.screenshot({
        path: "test-results/colossus-desktop-1440-fold.png",
        fullPage: false,
        animations: "disabled",
      });
    }
    await page.screenshot({
      path: `test-results/colossus-${viewport.name}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
});

test("keeps all main routes within the responsive viewport", async ({
  page,
}) => {
  const viewports = [
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 375, height: 812 },
  ];
  for (const route of routes) {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(route);
      await expect(page.locator("html")).toHaveJSProperty(
        "scrollWidth",
        viewport.width,
      );
    }
  }
});
