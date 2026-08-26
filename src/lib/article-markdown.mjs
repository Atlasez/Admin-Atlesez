import remarkMath from "remark-math";
import { remarkArticleDirectives } from "./article-directives.mjs";
import {
  rehypeArticleKatex,
  remarkArticleMathMacros,
} from "./article-math.mjs";
import {
  editorialImageStyle,
  editorialImageWidthFromUrl,
  removeEditorialImageWidthFromUrl,
} from "./editorial-image.mjs";
import { renderTikzSource } from "./tikz-renderer.mjs";
import { remarkJapaneseStrong } from "./article-japanese-strong.mjs";
export { remarkJapaneseStrong } from "./article-japanese-strong.mjs";
import { fromHtml } from "hast-util-from-html";

export const ARTICLE_KATEX_OPTIONS = {
  throwOnError: false,
  strict: "warn",
  macros: {
    "\\dv": "\\frac{\\mathrm{d}#1}{\\mathrm{d}#2}",
    "\\dvtwo": "\\frac{\\mathrm{d}^{2}#1}{\\mathrm{d}#2^{2}}",
    "\\dd": "\\,\\mathrm{d}#1",
    "\\vdot": "\\mathbin{\\cdot}",
    "\\divergence": "\\nabla\\mathbin{\\cdot}",
  },
};

export const ARTICLE_SHIKI_CONFIG = {
  themes: { light: "github-light", dark: "github-dark" },
};

export function remarkEditorialImageSizes() {
  return (tree) => {
    const visit = (node) => {
      if (node?.type === "image" && typeof node.url === "string") {
        const width = editorialImageWidthFromUrl(node.url);
        if (width) {
          node.url = removeEditorialImageWidthFromUrl(node.url);
          node.data ??= {};
          node.data.hProperties ??= {};
          node.data.hProperties.style = editorialImageStyle(width);
          node.data.hProperties["data-editorial-image-width"] = width;
        }
      }
      for (const child of node?.children ?? []) visit(child);
    };
    visit(tree);
  };
}

/**
 * Compile TikZ fences during the public Astro build. The generated SVG is
 * embedded in the article HTML, so the published page does not depend on a
 * browser-side TikZ engine and uses the same renderer as the editor preview.
 */
export function remarkArticleTikz() {
  return async (tree) => {
    const visit = async (node) => {
      if (!Array.isArray(node?.children)) return;
      for (const child of node.children) {
        if (child?.type === "code" && String(child.lang ?? "").toLowerCase() === "tikz") {
          try {
            const result = await renderTikzSource(child.value);
            Object.assign(child, {
              type: "paragraph",
              children: [],
              data: {
                hName: "div",
                hProperties: {
                  className: ["tikz-diagram"],
                  "data-tikz-hash": result.hash,
                },
                hChildren: fromHtml(result.svg, { fragment: true }).children,
              },
            });
            delete child.lang;
            delete child.value;
          } catch (error) {
            Object.assign(child, {
              type: "paragraph",
              children: [],
              data: {
                hName: "div",
                hProperties: { className: ["tikz-error"] },
                hChildren: [
                  { type: "element", tagName: "strong", properties: {}, children: [{ type: "text", value: "TikZを描画できませんでした" }] },
                  { type: "element", tagName: "span", properties: {}, children: [{ type: "text", value: error instanceof Error ? error.message : "SVG変換エラー" }] },
                ],
              },
            });
            delete child.lang;
            delete child.value;
          }
        } else {
          await visit(child);
        }
      }
    };
    await visit(tree);
  };
}

/** @type {import("@astrojs/markdown-remark").AstroMarkdownOptions["remarkPlugins"]} */
export const ARTICLE_REMARK_PLUGINS = [
  remarkArticleDirectives,
  remarkMath,
  remarkJapaneseStrong,
  remarkEditorialImageSizes,
  remarkArticleMathMacros,
  remarkArticleTikz,
];

/** @type {import("@astrojs/markdown-remark").AstroMarkdownOptions["rehypePlugins"]} */
export const ARTICLE_REHYPE_PLUGINS = [rehypeArticleKatex];

/** @type {import("@astrojs/markdown-remark").AstroMarkdownOptions} */
export const ARTICLE_MARKDOWN_PROCESSOR_OPTIONS = {
  remarkPlugins: ARTICLE_REMARK_PLUGINS,
  rehypePlugins: ARTICLE_REHYPE_PLUGINS,
  shikiConfig: ARTICLE_SHIKI_CONFIG,
};
