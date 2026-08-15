// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeMathjax from "rehype-mathjax/svg";

/**
 * 旧記事には Pandoc が出力した `<span class="math inline">\(...\)</span>`
 * が残っている。remark-math が扱えるのは Markdown の `$...$` なので、
 * そのままだと HTML の中の数式だけが文字列として残ってしまう。raw HTML
 * を HAST に展開したあと、MathJax が認識する math-inline / math-display
 * クラスへ正規化する。
 */
const normalizeLegacyMath = () => (/** @type {any} */ tree) => {
  /** @param {any} node */
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "element" && node.tagName === "span") {
      const classes = Array.isArray(node.properties?.className)
        ? node.properties.className.map(String)
        : [];
      const isInline =
        classes.includes("math-inline") ||
        (classes.includes("math") && classes.includes("inline"));
      const isDisplay =
        classes.includes("math-display") ||
        (classes.includes("math") && classes.includes("display"));
      if (isInline || isDisplay) {
        const text = (node.children ?? [])
          .filter((child) => child?.type === "text")
          .map((child) => String(child.value ?? ""))
          .join("")
          .trim();
        // Markdown's raw-HTML parser removes the backslashes from \\(…\\) and
        // \\[…\\]. The wrapper is still unambiguous from the legacy class.
        const value = isDisplay
          ? text.replace(/^\[/u, "").replace(/\]$/u, "").trim()
          : text.replace(/^\(/u, "").replace(/\)$/u, "").trim();
        node.properties = {
          ...(node.properties ?? {}),
          className: [isDisplay ? "math-display" : "math-inline"],
        };
        node.children = [{ type: "text", value }];
      }
    }
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  visit(tree);
};

/**
 * 旧記事の折りたたみは `<div class="folding">` / `<div class="supp">`
 * のまま保存されていることがある。CSS だけでは開閉できず、ブラウザの
 * JavaScript にも依存してしまうため、ビルド時に標準の details/summary
 * へ変換する。class は残すので既存の見た目と後方互換性も維持する。
 */
const normalizeLegacyFolding = () => (/** @type {any} */ tree) => {
  /** @param {any} node */
  const textContent = (node) => {
    if (!node || typeof node !== "object") return "";
    if (node.type === "text") return String(node.value ?? "");
    return Array.isArray(node.children)
      ? node.children.map(textContent).join("")
      : "";
  };

  /** @param {any} node */
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "element" && node.tagName === "div") {
      const classes = Array.isArray(node.properties?.className)
        ? node.properties.className.map(String)
        : [];
      const isSupplement = classes.includes("supp");
      const isFolding = classes.includes("folding");
      if (isSupplement || isFolding) {
        const children = Array.isArray(node.children) ? [...node.children] : [];
        const existingSummary = children.find(
          (child) => child?.type === "element" && child.tagName === "summary",
        );
        const titleElement = children.find(
          (child) =>
            child?.type === "element" &&
            (child.tagName === "h4" ||
              (Array.isArray(child.properties?.className) &&
                child.properties.className.some((name) =>
                  ["folding-title", "supp-title"].includes(String(name)),
                ))),
        );
        const explicitTitle =
          node.properties?.dataSummary ??
          node.properties?.dataTitle ??
          node.properties?.["data-summary"] ??
          node.properties?.["data-title"];
        const title = String(
          explicitTitle ||
            textContent(titleElement) ||
            (isSupplement ? "補足." : "折りたたみ"),
        ).trim();
        const summary = existingSummary ?? {
          type: "element",
          tagName: "summary",
          properties: {
            className: [
              isSupplement ? "supp-details-summary" : "folding-summary",
            ],
          },
          children: [{ type: "text", value: title }],
        };
        const body = existingSummary
          ? children.filter((child) => child !== existingSummary)
          : children.filter((child) => child !== titleElement);
        const inner = {
          type: "element",
          tagName: "div",
          properties: {
            className: [
              isSupplement ? "supp-details-inner" : "folding-content",
            ],
          },
          children: body,
        };
        node.tagName = "details";
        node.properties = {
          ...(node.properties ?? {}),
          className: [isSupplement ? "supp-details" : "folding"],
        };
        node.children = [summary, inner];
      }
    }
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  visit(tree);
};

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
        // Preserve legacy theorem/folding HTML and authored links before the
        // MathJax pass. Content is repository-controlled Markdown/HTML.
        rehypeRaw,
        normalizeLegacyFolding,
        normalizeLegacyMath,
        [
          rehypeMathjax,
          {
            // MathJax をビルド時に SVG 化する。ブラウザ側の CDN に依存しないため、
            // 折りたたみ内の式やオフライン閲覧でも同じ結果になる。
            tex: {
              // `macros` is supported by MathJax's configmacros package.
              // `configmacros` expects command names without the leading `\\`
              // and argument-bearing definitions as `[body, argumentCount]`.
              // Keeping these definitions here makes the authored physics
              // notation work consistently in every article at build time.
              macros: {
                dv: ["\\frac{\\mathrm{d}#1}{\\mathrm{d}#2}", 2],
                dvtwo: ["\\frac{\\mathrm{d}^{2}#1}{\\mathrm{d}#2^{2}}", 2],
                dd: ["\\,\\mathrm{d}#1", 1],
                vdot: "\\mathbin{\\cdot}",
                divergence: "\\nabla\\mathbin{\\cdot}",
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
