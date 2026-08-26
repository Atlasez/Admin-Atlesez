import { describe, expect, it } from "vitest";
import { renderArticleMarkdown } from "../../src/lib/article-browser-markdown.mjs";

describe("browser article Markdown renderer", () => {
  it("renders the same core Markdown, directives, tables, and KaTeX path used by articles", async () => {
    const html = await renderArticleMarkdown(
      "## 見出し\n\n:::prop 命題 {#p}\n\n本文 $\\R$\n\n:::\n\n| a | b |\n|---|---|\n| 1 | 2 |",
    );
    expect(html).toContain("<h2>見出し</h2>");
    expect(html).toContain('class="article-directive prop"');
    expect(html).toContain('id="p"');
    expect(html).toContain("<table>");
    expect(html).toContain('class="katex"');
  });

  it("uses a selected custom preset while keeping its source marker out of HTML", async () => {
    const html = await renderArticleMarkdown(
      "<!-- math-preset: custom-1 -->\n<!-- math-custom-preset: custom-1 -->\n\\newcommand{\\RR}{\\mathbb{R}}\n<!-- /math-custom-preset -->\n\n$\\RR$",
      { customPresets: { "custom-1": { macros: { "\\RR": "\\mathbb{R}" } } } },
    );
    expect(html).not.toContain("math-preset");
    expect(html).toContain('class="katex"');
  });

  it("keeps Japanese prose after strong emphasis from exposing Markdown markers", async () => {
    const html = await renderArticleMarkdown(
      "**Euclid整域(Euclidean domain)**という定義",
    );
    expect(html).toContain(
      "<strong>Euclid整域(Euclidean domain)</strong>という定義",
    );
    expect(html).not.toContain("**Euclid整域");
  });
});
