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

  it("keeps published mathematics theorem numbering as authored text", async () => {
    const processor = await createMarkdownProcessor();
    const rendered = await processor.render(
      [
        "### 群の定義",
        "",
        "定義 1 (群). $G$を集合とする. 以下の条件を満たす組を群という.",
        "",
        "命題 2 (可除律による群の特徴づけ). $G$を空でないマグマとする.",
      ].join("\n"),
    );
    const preview = mountPreview(rendered.code);

    expect(preview).not.toBeNull();
    applySubjectPreviewProfile(preview!, "mathematics");

    expect(preview?.dataset.previewSubject).toBe("mathematics");
    expect(preview?.dataset.publishedPreview).toBe("true");

    const body = preview?.querySelector<HTMLElement>(
      ":scope > [data-published-article-body]",
    );
    expect(body).not.toBeNull();
    expect(body?.classList.contains("article-body")).toBe(true);
    expect(body?.classList.contains("reading")).toBe(true);
    expect(body?.textContent).toContain("定義 1 (群).");
    expect(body?.textContent).toContain("命題 2 (可除律による群の特徴づけ).");
    expect(body?.querySelector(".defi,.thm,.prop,.thmtitle,.proof-details")).toBeNull();
  });

  it("does not invent directive boxes that the published Markdown renderer does not create", async () => {
    const processor = await createMarkdownProcessor();
    const rendered = await processor.render(
      [":::defi 群の定義", "", "本文", "", ":::"].join("\n"),
    );
    const preview = mountPreview(rendered.code);

    expect(preview).not.toBeNull();
    applySubjectPreviewProfile(preview!, "mathematics");

    const body = preview?.querySelector<HTMLElement>(
      ":scope > [data-published-article-body]",
    );
    expect(body?.querySelector(".editor-directive,.defi,.thmtitle")).toBeNull();
    expect(body?.textContent).toContain(":::defi 群の定義");
  });
});
