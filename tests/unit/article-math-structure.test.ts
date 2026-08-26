// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  normalizeMathArticleBody,
  numberMathStatements,
} from "../../src/scripts/article-math-structure";

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

    expect(body.querySelector(".defi .thmtitle")?.textContent).toContain(
      "定義 1",
    );
    expect(body.querySelector(".prop .thmtitle")?.textContent).toContain(
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

  it("numbers statements in reading order and resolves labelled references", () => {
    const body = bodyFrom(
      '<section class="article-directive prop" data-directive="prop" id="lagrange"><div class="thmtitle">ラグランジュの定理</div><p>本文</p></section><p>[[ref:lagrange]] を使う。</p>',
    );

    numberMathStatements(body);

    expect(body.querySelector("#lagrange .thmtitle")?.textContent).toBe(
      "命題1(ラグランジュの定理)",
    );
    expect(
      body
        .querySelector<HTMLAnchorElement>(".math-statement-reference")
        ?.getAttribute("href"),
    ).toBe("#lagrange");
    expect(body.querySelector(".math-statement-reference")?.textContent).toBe(
      "命題1",
    );
  });

  it("formats untitled statements and resolves unambiguous external references", () => {
    const body = bodyFrom(
      '<section class="article-directive thm" data-directive="thm" id="local"><p><span class="thmtitle">定理</span></p><p>本文</p></section><p>[[ref:external-result]] を使う。</p>',
    );

    numberMathStatements(body, {
      articleId: "article-local",
      locale: "ja",
      statementIndex: [
        {
          id: "external-result",
          articleId: "article-external",
          locale: "ja",
          articleTitle: "外部記事",
          label: "定理",
          number: 2,
          href: "/atlas/ja/mathematics/algebra/external/",
        },
      ],
    });

    expect(body.querySelector("#local .thmtitle")?.textContent).toBe("定理1");
    const link = body.querySelector<HTMLAnchorElement>(
      ".math-statement-reference-external",
    );
    expect(link?.textContent).toBe("外部記事:定理2");
    expect(link?.getAttribute("href")).toBe(
      "/atlas/ja/mathematics/algebra/external/#external-result",
    );
  });

  it("numbers all statement types with one counter in reading order", () => {
    const body = bodyFrom(
      '<section class="article-directive defi" data-directive="defi"><p><span class="thmtitle">定義</span></p></section><section class="article-directive prop" data-directive="prop"><p><span class="thmtitle">命題</span></p></section><section class="article-directive thm" data-directive="thm"><p><span class="thmtitle">定理</span></p></section><section class="article-directive lemma" data-directive="lemma"><p><span class="thmtitle">補題</span></p></section><section class="article-directive cor" data-directive="cor"><p><span class="thmtitle">系</span></p></section><section class="article-directive example" data-directive="example"><p><span class="thmtitle">例</span></p></section>',
    );

    numberMathStatements(body);

    expect(
      [...body.querySelectorAll<HTMLElement>(".thmtitle")].map(
        (title) => title.textContent,
      ),
    ).toEqual(["定義1", "命題2", "定理3", "補題4", "系5", "例6"]);
  });
});
