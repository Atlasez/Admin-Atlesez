import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { describe, expect, it } from "vitest";
import {
  mathMacrosFromSource,
  parseTexMacroDefinitions,
  stripMathPresetMarker,
} from "../../src/lib/article-math.mjs";
import { ARTICLE_MARKDOWN_PROCESSOR_OPTIONS } from "../../src/lib/article-markdown.mjs";

describe("article math macros", () => {
  it("keeps the legacy Spec operator available without changing article source", () => {
    const result = mathMacrosFromSource(
      "<!-- math-preset: geometry -->\n$$\\Spec$$",
    );
    expect(result.macros["\\Spec"]).toBe("\\operatorname{Spec}");
  });

  it("accepts newcommand and DeclareMathOperator declarations", () => {
    const { macros } = parseTexMacroDefinitions(
      "\\newcommand{\\vect}[1]{\\mathbf{#1}}\\DeclareMathOperator{\\rank}{rank}",
    );
    expect(macros["\\vect"]).toBe("\\mathbf{#1}");
    expect(macros["\\rank"]).toBe("\\operatorname{rank}");
  });

  it("combines a portable preset marker with article-local commands", () => {
    const result = mathMacrosFromSource(
      "<!-- math-preset: standard -->\n\\newcommand{\\field}{\\R}",
    );
    expect(result.preset).toBe("standard");
    expect(result.macros["\\R"]).toBe("\\mathbb{R}");
    expect(result.macros["\\field"]).toBe("\\R");
  });

  it("combines multiple preset markers for a selected preset group", () => {
    const result = mathMacrosFromSource(
      "<!-- math-preset: symbols-a -->\n<!-- math-preset: symbols-b -->",
      {
        "symbols-a": { macros: { "\\AA": "\\mathbb{A}" } },
        "symbols-b": { macros: { "\\BB": "\\mathbb{B}" } },
      },
    );
    expect(result.presets).toEqual(["symbols-a", "symbols-b"]);
    expect(result.macros["\\AA"]).toBe("\\mathbb{A}");
    expect(result.macros["\\BB"]).toBe("\\mathbb{B}");
  });

  it("removes editor-only preset comments and custom blocks from preview text", () => {
    expect(
      stripMathPresetMarker(
        "<!-- math-preset: algebra -->\n<!-- math-custom-preset: custom-1 -->\n\\newcommand{\\Hom}{...}\n<!-- /math-custom-preset -->\n本文",
      ),
    ).toBe("本文");
  });

  it("renders declarations and presets before KaTeX sees later equations", async () => {
    const processor = await createMarkdownProcessor(
      ARTICLE_MARKDOWN_PROCESSOR_OPTIONS,
    );
    const rendered = await processor.render(
      "<!-- math-preset: standard -->\n\n$$\\newcommand{\\vect}[1]{\\mathbf{#1}}$$\n\n$\\vect{x} \\in \\R$",
    );
    expect(rendered.code).not.toContain("katex-error");
    expect(rendered.code).toContain("mathbb");
    expect(rendered.code).toContain("mathbf");
  });

  it("renders editorial image width metadata as responsive inline style", async () => {
    const processor = await createMarkdownProcessor(
      ARTICLE_MARKDOWN_PROCESSOR_OPTIONS,
    );
    const rendered = await processor.render(
      "![図](/images/editorial/doc/diagram.png?width=60%)",
    );
    expect(rendered.code).toContain(
      'style="width:60%;max-width:100%;" data-editorial-image-width="60%"',
    );
    expect(rendered.code).not.toContain("diagram.png?width=60%");
  });
});
