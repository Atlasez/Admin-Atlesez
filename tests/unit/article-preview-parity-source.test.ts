import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readSource = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

describe("article preview parity source of truth", () => {
  it("keeps article content CSS out of the published page and admin overrides", async () => {
    const [publishedPage, adminLayout] = await Promise.all([
      readSource("src/pages/atlas/[locale]/[subject]/[category]/[slug].astro"),
      readSource("src/layouts/AdminLayout.astro"),
    ]);

    expect(publishedPage).not.toContain(".article-body :global(");
    expect(adminLayout).toContain('import "../styles/article-content.css";');
    expect(adminLayout).not.toContain("admin-published-preview.css");
  });

  it("uses the same Markdown and math-structure modules for public and admin rendering", async () => {
    const [astroConfig, atlasLayout, previewScript] = await Promise.all([
      readSource("astro.config.mjs"),
      readSource("src/layouts/AtlasLayout.astro"),
      readSource("src/scripts/admin-editor-subject-preview.ts"),
    ]);

    expect(astroConfig).toContain("ARTICLE_MARKDOWN_PROCESSOR_OPTIONS");
    expect(previewScript).toContain("ARTICLE_MARKDOWN_PROCESSOR_OPTIONS");
    expect(atlasLayout).toContain(
      'import "../scripts/article-math-structure";',
    );
    expect(previewScript).toContain('from "./article-math-structure"');
  });
});
