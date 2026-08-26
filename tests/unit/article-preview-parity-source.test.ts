import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readSource = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

describe("article preview parity source of truth", () => {
  it("keeps shared article content styling out of published-page overrides", async () => {
    const [publishedPage, adminLayout, baseHead] = await Promise.all([
      readSource("src/pages/atlas/[locale]/[subject]/[category]/[slug].astro"),
      readSource("src/layouts/AdminLayout.astro"),
      readSource("src/components/BaseHead.astro"),
    ]);

    // Page-specific responsive rules may target the rendered article body, but
    // reusable directive/content styling must remain in article-content.css.
    for (const selector of [
      ".article-body :global(.defi)",
      ".article-body :global(.thm)",
      ".article-body :global(.prop)",
      ".article-body :global(.cor)",
      ".article-body :global(.lemma)",
      ".article-body :global(.example)",
      ".article-body :global(.article-directive)",
    ]) {
      expect(publishedPage).not.toContain(selector);
    }
    expect(baseHead).toContain('import "../styles/article-content.css";');
    expect(adminLayout).toContain('import "../styles/article-content.css";');
    expect(adminLayout).not.toContain("admin-published-preview.css");
  });

  it("uses shared math structure without loading server-only Markdown code in the browser", async () => {
    const [astroConfig, baseHead, previewScript] = await Promise.all([
      readSource("astro.config.mjs"),
      readSource("src/components/BaseHead.astro"),
      readSource("src/scripts/admin-editor-subject-preview.ts"),
    ]);

    expect(astroConfig).toContain("ARTICLE_MARKDOWN_PROCESSOR_OPTIONS");
    expect(previewScript).not.toContain("@astrojs/markdown-remark");
    expect(baseHead).toContain('import "../scripts/article-math-structure";');
    expect(previewScript).toContain('from "./article-math-structure"');
  });
});
