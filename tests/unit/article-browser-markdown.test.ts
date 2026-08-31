/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import {
  hydrateTikzDiagrams,
  renderArticleMarkdown,
} from "../../src/lib/article-browser-markdown.mjs";

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

  it("renders inline math in directive frame titles", async () => {
    const html = await renderArticleMarkdown(
      ":::defi 定義 $G$ の単位元 {#group-unit}\n\n本文\n\n:::",
    );
    expect(html).toContain('class="thmtitle"');
    expect(html).toContain('class="katex"');
    expect(html).toContain("data-authored-statement-title");
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

  it("renders folding directives as collapsible details and typesets math in titles", async () => {
    const html = await renderArticleMarkdown(
      [
        ":::prop $G$ の群 {#group}",
        "",
        "本文",
        "",
        ":::folding 補足 $x$",
        "",
        "中身 $x$",
        "",
        ":::",
        "",
        ":::",
      ].join("\n"),
    );

    expect(html).toContain(
      '<details class="folding" data-directive="folding">',
    );
    expect(html).toContain("<summary>補足");
    expect(html).toContain('class="folding-content"');
    expect(html.match(/class="katex"/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("renders proof and supplement directives as interactive details", async () => {
    const html = await renderArticleMarkdown(
      [
        ":::proof",
        "",
        "証明本文",
        "",
        ":::",
        "",
        ":::supp 補足",
        "",
        "補足本文",
        "",
        ":::",
      ].join("\n"),
    );

    expect(html).toContain(
      '<details class="proof-details folding" data-directive="proof" open>',
    );
    expect(html).toContain(
      '<details class="supp-details" data-directive="supp">',
    );
    expect(html).toContain('class="supp-details-inner"');
  });

  it("turns TikZ fences into stable live-preview placeholders", async () => {
    const html = await renderArticleMarkdown(
      [
        "## 図",
        "",
        "```tikz",
        "\\begin{tikzpicture}\\draw (0,0)--(1,0);\\end{tikzpicture}",
        "```",
      ].join("\n"),
    );
    expect(html).toContain('class="tikz-diagram tikz-diagram-pending"');
    expect(html).toContain("data-tikz-source=");
    expect(html).toContain("TikZをSVG化しています");
  });

  it("does not let an aborted preview poison the next identical render", async () => {
    let resolveResponse:
      | ((value: { ok: boolean; json: () => Promise<{ svg: string }> }) => void)
      | undefined;
    const response = new Promise<{
      ok: boolean;
      json: () => Promise<{ svg: string }>;
    }>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn(() => response);
    vi.stubGlobal("fetch", fetchMock);

    const source = "\\begin{tikzpicture}\\draw (0,0)--(1,0);\\end{tikzpicture}";
    const firstTarget = document.createElement("div");
    firstTarget.innerHTML = `<div class="tikz-diagram tikz-diagram-pending" data-tikz-source="${encodeURIComponent(source)}"></div>`;
    document.body.append(firstTarget);
    const controller = new AbortController();
    const first = hydrateTikzDiagrams(firstTarget, {
      endpoint: "/tikz-test",
      signal: controller.signal,
    });
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    controller.abort();

    const secondTarget = document.createElement("div");
    secondTarget.innerHTML = `<div class="tikz-diagram tikz-diagram-pending" data-tikz-source="${encodeURIComponent(source)}"></div>`;
    document.body.append(secondTarget);
    const second = hydrateTikzDiagrams(secondTarget, {
      endpoint: "/tikz-test",
    });
    resolveResponse?.({
      ok: true,
      json: async () => ({ svg: '<svg aria-label="ok"></svg>' }),
    });
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(secondTarget.querySelector("svg")).not.toBeNull();
    expect(firstTarget.querySelector("[data-tikz-source]")).not.toBeNull();
    vi.unstubAllGlobals();
  });
});
