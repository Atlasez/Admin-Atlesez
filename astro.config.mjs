// @ts-check
import { defineConfig } from "astro/config";
import { readFile } from "node:fs/promises";
import sitemap from "@astrojs/sitemap";
import { unified } from "@astrojs/markdown-remark";
import "katex/contrib/mhchem";
import {
  ARTICLE_MARKDOWN_PROCESSOR_OPTIONS,
  ARTICLE_SHIKI_CONFIG,
} from "./src/lib/article-markdown.mjs";

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

// noindex ページを sitemap に含めると Search Console が「サイトマップ内なのに
// noindex」と報告する。最終HTMLを確認してから sitemap の対象を確定する。
const noindexPaths = new Set();
const normalizePathname = (pathname) => {
  const normalized = pathname.replace(/^\//, "").replace(/index\.html$/, "");
  return `/${normalized}`.replace(/\/+/g, "/");
};

const collectNoindexPages = () => ({
  name: "collect-noindex-pages-for-sitemap",
  hooks: {
    "astro:build:done": async ({ dir, pages }) => {
      noindexPaths.clear();
      await Promise.all(
        pages.map(async (page) => {
          try {
            const html = await readFile(new URL(page.pathname, dir), "utf8");
            if (
              /<meta\s+name=["']robots["'][^>]*content=["'][^"']*\bnoindex\b/i.test(
                html,
              )
            ) {
              noindexPaths.add(normalizePathname(page.pathname));
            }
          } catch {
            // 読めないページは推測で除外せず、通常どおり扱う。
          }
        }),
      );
    },
  },
});

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
  integrations: [
    collectNoindexPages(),
    sitemap({
      filter: (page) => !noindexPaths.has(normalizePathname(page)),
    }),
  ],
  markdown: {
    processor: unified(ARTICLE_MARKDOWN_PROCESSOR_OPTIONS),
    shikiConfig: ARTICLE_SHIKI_CONFIG,
  },
  build: {
    format: "directory",
  },
});
