// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { normalizeMathArticleBody } from "../../src/scripts/article-math-structure";

const bodyFrom = (html: string) => {
  document.body.innerHTML = `<div class="article-body reading">${html}</div>`;
  return document.querySelector<HTMLElement>(".article-body")!;
};

describe("shared math article structure", () => {
  it("normalizes legacy definition and theorem paragraphs into semantic boxes", () => {
    const body = bodyFrom(
      "<p>定義 1 (群). 集合 G を考える.</p><p>通常本文</p><p>命題 2. 主張</p>",
    );

    normalizeMathArticleBody(body);

    expect(body.querySelector(".defi > .thmtitle")?.textContent).toContain(
      "定義 1",
    );
    expect(body.querySelector(".prop > .thmtitle")?.textContent).toContain(
      "命題 2",
    );
    expect(body.querySelectorAll(".defi")).toHaveLength(1);
    expect(body.querySelectorAll(".prop")).toHaveLength(1);
  });

  it("normalizes proof paragraphs and is idempotent", () => {
    const body = bodyFrom("<p>証明. ここから証明する.</p><p>続き</p>");

    normalizeMathArticleBody(body);
    normalizeMathArticleBody(body);

    expect(body.querySelectorAll("details.proof-details")).toHaveLength(1);
    expect(body.querySelector(".proof-details-inner")?.textContent).toContain(
      "ここから証明する",
    );
  });

  it("does not rewrap authored directive boxes", () => {
    const body = bodyFrom(
      '<section class="article-directive defi" data-directive="defi"><div class="thmtitle">定義 3</div><p>本文</p></section>',
    );

    normalizeMathArticleBody(body);

    expect(body.querySelectorAll("[data-directive=defi]")).toHaveLength(1);
    expect(body.querySelectorAll(".defi")).toHaveLength(1);
  });
});
