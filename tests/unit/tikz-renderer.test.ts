import { describe, expect, it } from "vitest";
import {
  assertSafeTikzSource,
  normalizeTikzMathSlashes,
  normalizeTikzLibraries,
  normalizeTikzPackages,
  normalizeTikzSvgFonts,
  TIKZ_MAX_RENDERED_SVG_LENGTH,
} from "../../src/lib/tikz-policy.mjs";
import { renderTikzSource } from "../../src/lib/tikz-renderer.mjs";
import { renderArticleMarkdown } from "../../src/lib/article-browser-markdown.mjs";

describe("TikZ server renderer policy", () => {
  it("allows large but bounded rendered diagrams", () => {
    expect(TIKZ_MAX_RENDERED_SVG_LENGTH).toBe(4_000_000);
  });

  it("accepts bundled packages and libraries only", () => {
    expect(normalizeTikzPackages(["pgfplots", "amsmath:intlimits"])).toEqual([
      { name: "pgfplots", options: "" },
      { name: "amsmath", options: "intlimits" },
    ]);
    expect(normalizeTikzLibraries(["arrows.meta", "calc"])).toEqual([
      "arrows.meta",
      "calc",
    ]);
    expect(() => normalizeTikzPackages(["minted"])).toThrow();
    expect(() => normalizeTikzLibraries(["external"])).toThrow();
  });

  it("rejects file and shell access", () => {
    expect(() => assertSafeTikzSource("\\input{secret}")).toThrow();
    expect(() => assertSafeTikzSource("\\write18{touch /tmp/x}")).toThrow();
  });

  it("renders a TikZ block to sanitized SVG", async () => {
    const result = await renderTikzSource(
      "\\begin{tikzpicture}\\node at (0,0) {$A$};\\draw[->] (0,0)--(2,0);\\end{tikzpicture}",
      { libraries: ["arrows.meta"] },
    );
    expect(result.svg).toMatch(/^<svg(?:\s|>)/);
    expect(result.svg).toMatch(
      /@import url\(https:\/\/cdn\.jsdelivr\.net\/npm\/node-tikzjax@1\.0\.5\/css\/fonts\.css\)/,
    );
    expect(result.svg).toContain('stroke="currentColor"');
    expect(result.svg).not.toMatch(/(?:fill|stroke)="#(?:000|000000)"/i);
    expect(result.svg).not.toMatch(/<script|foreignObject/i);
    expect(result.hash).toHaveLength(64);
  });

  it("preserves math slashes and aligns TikZ label fonts", async () => {
    const source = String.raw`\begin{tikzpicture}
\node (a) at (0,0) {$G_1/N$};
\node (b) at (4,0) {$G_2$};
\draw[->] (a) -- node[above] {$\varphi$} (b);
\end{tikzpicture}`;
    expect(normalizeTikzMathSlashes(source)).toContain(
      String.raw`G_1\left/\right.N`,
    );
    const result = await renderTikzSource(source);
    expect(result.svg).toContain(">/</text>");
    expect(result.svg).toContain('font-family="KaTeX_Math, cmmi10"');
    expect(normalizeTikzSvgFonts('font-family="cmmi10"')).toContain(
      "KaTeX_Math",
    );
  });

  it("does not expose top-level macro declarations as article prose", async () => {
    const html = await renderArticleMarkdown(
      String.raw`\newcommand{\Inn}{\operatorname{Inn}}

## 準同型定理

本文 $\Inn(G)$。`,
    );
    expect(html).not.toMatch(/newcommand|operatorname/);
    expect(html).toContain("準同型定理");
  });
});
