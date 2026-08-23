// @vitest-environment jsdom

import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { beforeEach, describe, expect, it } from "vitest";
import { ARTICLE_MARKDOWN_PROCESSOR_OPTIONS } from "../../src/lib/article-markdown.mjs";
import { applySubjectPreviewProfile } from "../../src/scripts/admin-editor-subject-preview";

const mountPreview = (html: string) => {
  document.body.innerHTML = `<article class="article-preview">${html}</article>`;
  return document.querySelector<HTMLElement>("article");
};

const renderArticleMarkdown = async (markdown: string) => {
  const processor = await createMarkdownProcessor(
    ARTICLE_MARKDOWN_PROCESSOR_OPTIONS,
  );
  return processor.render(markdown);
};

describe("admin editor subject preview", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("uses the published article DOM shell", async () => {
    const rendered = await renderArticleMarkdown("## 見出し\n\n本文");
    const preview = mountPreview(rendered.code)!;

    applySubjectPreviewProfile(preview, "mathematics");

    expect(preview.classList.contains("article-main")).toBe(true);
    expect(preview.classList.contains("article-preview")).toBe(false);
    expect(
      preview.querySelector(":scope > .article-body.reading"),
    ).not.toBeNull();
  });

  it("preserves authored theorem numbering and renders math with KaTeX", async () => {
    const rendered = await renderArticleMarkdown(
      [
        "### 群の定義",
        "",
        "定義 1 (群). $G$を集合とする.",
        "",
        "命題 2 (可除律による群の特徴づけ). $G$を空でないマグマとする.",
      ].join("\n"),
    );
    const preview = mountPreview(rendered.code)!;

    applySubjectPreviewProfile(preview, "mathematics");
    const body = preview.querySelector<HTMLElement>(
      ":scope > .article-body.reading",
    );

    expect(body?.textContent).toContain("定義 1 (群).");
    expect(body?.textContent).toContain("命題 2 (可除律による群の特徴づけ).");
    expect(body?.querySelector(".katex")).not.toBeNull();
  });

  it("renders ::: defi with the same directive transform used by published Markdown", async () => {
    const rendered = await renderArticleMarkdown(
      ["::: defi 定義 1 (群)", "", "集合 $G$ を考える。", "", ":::"].join("\n"),
    );
    const preview = mountPreview(rendered.code)!;

    applySubjectPreviewProfile(preview, "mathematics");
    const body = preview.querySelector<HTMLElement>(
      ":scope > .article-body.reading",
    );
    const directive = body?.querySelector<HTMLElement>(
      '[data-directive="defi"]',
    );

    expect(directive).not.toBeNull();
    expect(directive?.classList.contains("defi")).toBe(true);
    expect(directive?.querySelector(".thmtitle")?.textContent).toBe(
      "定義 1 (群)",
    );
    expect(directive?.querySelector("p")?.textContent).toContain("集合");
    expect(body?.textContent).not.toContain("::: defi");
  });

  it("renders theorem aliases, proof and arbitrary directives", async () => {
    const rendered = await renderArticleMarkdown(
      [
        ":::: theorem 定理 2",
        "",
        "本文",
        "",
        "::::",
        "",
        "::: proof 証明",
        "",
        "証明本文",
        "",
        ":::",
        "",
        "::: custom-box 注意事項",
        "",
        "任意枠本文",
        "",
        ":::",
      ].join("\n"),
    );
    const preview = mountPreview(rendered.code)!;

    applySubjectPreviewProfile(preview, "mathematics");
    const body = preview.querySelector<HTMLElement>(
      ":scope > .article-body.reading",
    );

    expect(
      body?.querySelector('[data-directive="theorem"].thm'),
    ).not.toBeNull();
    expect(
      body?.querySelector('details.proof-details[data-directive="proof"]'),
    ).not.toBeNull();
    expect(
      body?.querySelector(
        '[data-directive="custom-box"] .article-directive-title',
      )?.textContent,
    ).toBe("注意事項");
  });
});
