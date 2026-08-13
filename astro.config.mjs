// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import rehypeMathjax from "rehype-mathjax/svg";

// MathJax SVG は意味のある数式画像として扱えるよう、axe/スクリーン
// リーダー向けの名前を付ける。本文の数式自体は SVG 内に保持される。
const labelMathJaxSvg = () => (/** @type {any} */ tree) => {
  /** @param {any} node */
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (
      node.type === "element" &&
      node.tagName === "svg" &&
      node.properties?.role === "img" &&
      !node.properties["aria-label"] &&
      !node.properties["aria-labelledby"]
    ) {
      node.properties["aria-label"] = "数式";
    }
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  visit(tree);
};

// サイトURLとベースパスは環境変数だけで切り替えられる。
// - Cloudflare Pages 本番: SITE_URL=https://<独自ドメイン>  BASE_PATH=/
// - Cloudflare Pages プレビュー: SITE_URL 未設定 → CF_PAGES_URL（デプロイ固有のURL）
// - GitHub Pages (project site): SITE_URL=https://<user>.github.io BASE_PATH=/<repo>
//
// CF_PAGES_URL は Cloudflare Pages がビルド時に自動で入れる変数。
// SITE_URL を Production 環境にだけ設定しておけば、プレビューは自分自身の
// URL を canonical / OGP に使うため、本番URLと取り違えることがない。
const SITE_URL =
  process.env.SITE_URL ?? process.env.CF_PAGES_URL ?? "http://localhost:4321";
const BASE_PATH = process.env.BASE_PATH ?? "/";

export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH,
  outDir: process.env.OUT_DIR ?? "./dist",
  trailingSlash: "always",
  // 「あとで読む」「学習の記録」は「学習リスト」1ページに統合した。
  // 以前のURLを開いた人が迷子にならないよう転送する。
  redirects: {
    "/atlas/ja/bookmarks/": "/atlas/ja/list/",
    "/atlas/ja/history/": "/atlas/ja/list/",
  },
  integrations: [sitemap()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [
        [
          rehypeMathjax,
          {
            // MathJax をビルド時に SVG 化する。ブラウザ側の CDN に依存しないため、
            // 折りたたみ内の式やオフライン閲覧でも同じ結果になる。
            tex: {
              // `macros` is supported by MathJax's configmacros package.
              macros: {
                "\\dv": "\\frac{\\mathrm{d}#1}{\\mathrm{d}#2}",
                "\\dvtwo": "\\frac{\\mathrm{d}^{2}#1}{\\mathrm{d}#2^{2}}",
                "\\dd": "\\,\\mathrm{d}#1",
                "\\vdot": "\\mathbin{\\cdot}",
                "\\divergence": "\\nabla\\mathbin{\\cdot}",
              },
            },
            svg: {
              // 数式 SVG を role=img として読み上げられるようにする。
              internalSpeechTitles: true,
            },
          },
        ],
        [labelMathJaxSvg],
      ],
    }),
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
    },
  },
  build: {
    format: "directory",
  },
});
