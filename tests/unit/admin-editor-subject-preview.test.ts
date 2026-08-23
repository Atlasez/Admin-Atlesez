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

  it("converts rendered Markdown directive fences into a mathematics theorem box", async () => {
    const processor = await createMarkdownProcessor();
    const markdown = [
      "## 群",
      "",
      ":::defi 群の定義",
      "集合 $G$ に二項演算があるとする。",
      ":::",
    ].join("\n");
    const rendered = await processor.render(markdown);
    const preview = mountPreview(rendered.code);

    expect(preview).not.toBeNull();
    applySubjectPreviewProfile(preview!, "mathematics");

    expect(preview?.dataset.previewSubject).toBe("mathematics");
    expect(preview?.classList.contains("article-body")).toBe(true);
    expect(preview?.classList.contains("reading")).toBe(true);

    const directive = preview?.querySelector<HTMLElement>(
      '[data-directive="defi"]',
    );
    expect(directive).not.toBeNull();
    expect(directive?.classList.contains("editor-directive")).toBe(true);
    expect(directive?.classList.contains("defi")).toBe(true);
    expect(directive?.querySelector(".thmtitle")?.textContent).toBe("群の定義");
    expect(directive?.textContent).toContain("集合");
    expect(preview?.textContent).not.toContain(":::defi");
  });

  it("converts arbitrary named directives after Markdown rendering", async () => {
    const processor = await createMarkdownProcessor();
    const rendered = await processor.render(
      ["::::custom-box 任意枠", "本文", "::::"].join("\n"),
    );
    const preview = mountPreview(rendered.code);

    expect(preview).not.toBeNull();
    applySubjectPreviewProfile(preview!, "mathematics");

    const directive = preview?.querySelector<HTMLElement>(
      '[data-directive="custom-box"]',
    );
    expect(directive).not.toBeNull();
    expect(directive?.classList.contains("editor-directive-custom-box")).toBe(
      true,
    );
    expect(directive?.querySelector(".thmtitle")?.textContent).toBe("任意枠");
  });
});
