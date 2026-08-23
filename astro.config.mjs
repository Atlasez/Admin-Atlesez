// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { unified } from "@astrojs/markdown-remark";
import "katex/contrib/mhchem";
import { ARTICLE_MARKDOWN_PROCESSOR_OPTIONS } from "./src/lib/article-markdown.mjs";

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
    processor: unified(ARTICLE_MARKDOWN_PROCESSOR_OPTIONS),
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
    },
  },
  build: {
    format: "directory",
  },
});
