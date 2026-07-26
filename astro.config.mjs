// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/contrib/mhchem";

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
  integrations: [sitemap()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [
        [
          rehypeKatex,
          {
            throwOnError: false,
            strict: "warn",
            macros: {
              "\\dv": "\\frac{\\mathrm{d}#1}{\\mathrm{d}#2}",
              "\\dvtwo": "\\frac{\\mathrm{d}^{2}#1}{\\mathrm{d}#2^{2}}",
              "\\dd": "\\,\\mathrm{d}#1",
              "\\vdot": "\\mathbin{\\cdot}",
              "\\divergence": "\\nabla\\mathbin{\\cdot}",
            },
          },
        ],
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
