// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/contrib/mhchem";

// サイトURLとベースパスは環境変数だけで切り替えられる。
// - GitHub Pages (project site): SITE_URL=https://<user>.github.io BASE_PATH=/atlasez-web
// - 独自ドメイン:                SITE_URL=https://atlasez.org      BASE_PATH=/
const SITE_URL = process.env.SITE_URL ?? "https://atlasez.github.io";
const BASE_PATH = process.env.BASE_PATH ?? "/";

export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH,
  outDir: process.env.OUT_DIR ?? "./dist",
  trailingSlash: "always",
  integrations: [sitemap()],
  markdown: {
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
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
    },
  },
  build: {
    format: "directory",
  },
});
