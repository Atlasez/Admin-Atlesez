import { expect, test } from "@playwright/test";

const nonArticlePages = [
  "/",
  "/join/",
  "/apply/",
  "/applicant/",
  "/onboarding/",
  "/atlas/ja/",
];

for (const path of nonArticlePages) {
  test(`記事用の数式・参照JSを読み込まない: ${path}`, async ({ page }) => {
    const articleEnhancementRequests: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (
        /\/_astro\/(?:article-math-structure|article-references|katex)(?:\.|\/)/.test(
          pathname,
        )
      ) {
        articleEnhancementRequests.push(pathname);
      }
    });

    await page.goto(path);

    expect(articleEnhancementRequests).toEqual([]);
  });
}

test("記事画面では記事用の数式・参照JSを読み込む", async ({ page }) => {
  const articleEnhancementRequests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (
      /\/_astro\/(?:article-math-structure|article-references)(?:\.|\/)/.test(
        pathname,
      )
    ) {
      articleEnhancementRequests.push(pathname);
    }
  });

  await page.goto("/atlas/ja/mathematics/group-theory/group-definition/");

  expect(
    articleEnhancementRequests.some((pathname) =>
      pathname.includes("article-math-structure"),
    ),
  ).toBe(true);
  expect(
    articleEnhancementRequests.some((pathname) =>
      pathname.includes("article-references"),
    ),
  ).toBe(true);
});

test("記事練習は数式プレビューを保ち、記事本文用JSは読み込まない", async ({
  page,
}) => {
  const requestedPaths: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/_astro/")) requestedPaths.push(pathname);
  });

  await page.goto("/onboarding/atlas-writing-practice/");

  expect(requestedPaths.some((pathname) => pathname.includes("katex."))).toBe(
    true,
  );
  expect(
    requestedPaths.some((pathname) =>
      /article-math-structure|article-references/.test(pathname),
    ),
  ).toBe(false);
});
