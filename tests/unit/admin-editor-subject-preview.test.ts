// @vitest-environment jsdom

import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { beforeEach, describe, expect, it } from "vitest";
import { applySubjectPreviewProfile } from "../../src/scripts/admin-editor-subject-preview";

const mountPreview = (html: string) => {
  document.body.innerHTML = `<article class="article-preview">${html}</article>`;
  return document.querySelector<HTMLElement>("article");
};

describe("admin editor subject preview", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("preserves authored theorem numbering outside directive syntax", async () => {
    const processor = await createMarkdownProcessor();
    const rendered = await processor.render(
      [
        "### 群の定義",
        "",
        "定義 1 (群). $G$を集合とする.",
        "",
        "命題 2 (可除律による群の特徴づけ). $G$を空でないマグマとする.",
      ].join("\n"),
    );
    const preview = mountPreview(rendered.code);

    applySubjectPreviewProfile(preview!, "mathematics");
    const body = preview?.querySelector<HTMLElement>(
      ":scope > [data-published-article-body]",
    );

    expect(body?.textContent).toContain("定義 1 (群).");
    expect(body?.textContent).toContain("命題 2 (可除律による群の特徴づけ).");
  });

  it("renders ::: defi as a definition frame", async () => {
    const processor = await createMarkdownProcessor();
    const rendered = await processor.render(
      ["::: defi 定義 1 (群)", "", "集合 $G$ を考える。", "", ":::"].join(
        "\n",
      ),
    );
    const preview = mountPreview(rendered.code);

    applySubjectPreviewProfile(preview!, "mathematics");
    const body = preview?.querySelector<HTMLElement>(
      ":scope > [data-published-article-body]",
    );
    const directive = body?.querySelector<HTMLElement>(
      '[data-directive="defi"]',
    );

    expect(directive).not.toBeNull();
    expect(directive?.classList.contains("defi")).toBe(true);
    expect(directive?.querySelector(".thmtitle")?.textContent).toBe(
      "定義 1 (群)",
    );
    expect(directive?.textContent).toContain("集合");
    expect(body?.textContent).not.toContain("::: defi");
  });

  it("renders theorem aliases and arbitrary directives", async () => {
    const processor = await createMarkdownProcessor();
    const rendered = await processor.render(
      [
        ":::: theorem 定理 2",
        "",
        "本文",
        "",
        "::::",
        "",
        "::: custom-box 注意事項",
        "",
        "任意枠本文",
        "",
        ":::",
      ].join("\n"),
    );
    const preview = mountPreview(rendered.code);

    applySubjectPreviewProfile(preview!, "mathematics");
    const body = preview?.querySelector<HTMLElement>(
      ":scope > [data-published-article-body]",
    );

    expect(body?.querySelector('[data-directive="theorem"].thm')).not.toBeNull();
    expect(
      body?.querySelector('[data-directive="custom-box"] .editor-directive-heading')
        ?.textContent,
    ).toBe("注意事項");
  });
});
