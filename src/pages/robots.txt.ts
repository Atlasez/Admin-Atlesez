import type { APIRoute } from "astro";
import { IS_PRODUCTION_DEPLOY } from "../lib/deploy";

/**
 * robots.txt を動的に出す。
 * - sitemap の URL をデプロイ先に追従させる（以前は GitHub Pages のURL固定だった）
 * - プレビュー配信（Cloudflare Pages の main 以外）は全面的にクロール拒否する
 */
export const GET: APIRoute = ({ site }) => {
  const sitemap = site ? new URL("sitemap-index.xml", site).href : null;

  const body = IS_PRODUCTION_DEPLOY
    ? [
        "User-agent: *",
        "Allow: /",
        "",
        ...(sitemap ? [`Sitemap: ${sitemap}`] : []),
      ].join("\n")
    : [
        "# プレビュー配信のため検索エンジンには公開しない",
        "User-agent: *",
        "Disallow: /",
      ].join("\n");

  return new Response(`${body}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
