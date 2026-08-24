import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { remarkArticleDirectives } from "./article-directives.mjs";

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

/** @type {import("@astrojs/markdown-remark").AstroMarkdownOptions["remarkPlugins"]} */
export const ARTICLE_REMARK_PLUGINS = [remarkArticleDirectives, remarkMath];

/** @type {import("@astrojs/markdown-remark").AstroMarkdownOptions["rehypePlugins"]} */
export const ARTICLE_REHYPE_PLUGINS = [[rehypeKatex, ARTICLE_KATEX_OPTIONS]];

/** @type {import("@astrojs/markdown-remark").AstroMarkdownOptions} */
export const ARTICLE_MARKDOWN_PROCESSOR_OPTIONS = {
  remarkPlugins: ARTICLE_REMARK_PLUGINS,
  rehypePlugins: ARTICLE_REHYPE_PLUGINS,
  shikiConfig: ARTICLE_SHIKI_CONFIG,
};
