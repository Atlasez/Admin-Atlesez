import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import remarkSmartypants from "remark-smartypants";
import { remarkArticleDirectives } from "./article-directives.mjs";
import { remarkJapaneseStrong } from "./article-japanese-strong.mjs";
import {
  rehypeArticleKatex,
  remarkArticleMathMacros,
} from "./article-math.mjs";
import { assertSafeTikzSource } from "./tikz-policy.mjs";
import {
  editorialImageStyle,
  editorialImageWidthFromUrl,
  removeEditorialImageWidthFromUrl,
} from "./editorial-image.mjs";

const TIKZJAX_SCRIPT_URL = "https://tikzjax.com/v1/tikzjax.js";
const TIKZJAX_FONT_URL = "https://tikzjax.com/v1/fonts.css";
const TIKZ_FREE_RENDER_TIMEOUT_MS = 60_000;
const TIKZ_RETRY_DELAY_MS = 350;

// 入力中のプレビュー更新で同じTikZを何度もWASM組版しないための共有キャッシュ。
const tikzSvgCache = new Map();
const tikzRenderPromises = new Map();

const tikzAttribute = (value) => encodeURIComponent(String(value ?? ""));

/**
 * TikZJax puts Computer Modern font-family names in the generated SVG, but
 * its font-face declarations live in the hidden renderer iframe. Once the
 * SVG is moved into the editor preview, that stylesheet is gone. Embed the
 * same declaration in the SVG so the preview does not fall back to Chrome's
 * default serif font.
 */
function embedTikzFontCss(svg) {
  const value = String(svg ?? "")
    .replace(/\b(fill|stroke)=(['"])#(?:000|000000)\2/gi, "$1=$2currentColor$2")
    .replace(/\b(fill|stroke)\s*:\s*#(?:000|000000)\b/gi, "$1: currentColor");
  if (!/^<svg(?:\s|>)/i.test(value)) return value;
  if (/data-atlasez-tikz-fonts/i.test(value)) return value;
  const style =
    '<style data-atlasez-tikz-fonts="true">@import url("' +
    TIKZJAX_FONT_URL +
    '");</style>';
  if (/<defs(?:\s|>)/i.test(value))
    return value.replace(/<defs(\s[^>]*)?>/i, (match) => `${match}${style}`);
  return value.replace(/(<svg(?:\s[^>]*)?>)/i, `$1<defs>${style}</defs>`);
}

const EDITORIAL_ASSET_URL = /^asset:\/\/([0-9a-f-]{36})(?:\?[^)]*)?$/i;

/** Preserve editor-only asset markers so the admin hydrator can load them. */
export function remarkBrowserEditorialAssets() {
  return (tree) => {
    const visit = (node) => {
      if (!Array.isArray(node?.children)) return;
      for (const child of node.children) {
        if (child?.type === "image" && typeof child.url === "string") {
          const match = EDITORIAL_ASSET_URL.exec(child.url.trim());
          if (match) {
            const width = editorialImageWidthFromUrl(child.url);
            child.url = removeEditorialImageWidthFromUrl(child.url);
            child.data ??= {};
            child.data.hProperties ??= {};
            child.data.hProperties.className = ["is-loading"];
            child.data.hProperties["data-editorial-asset"] = match[1];
            if (width) {
              child.data.hProperties.style = editorialImageStyle(width);
              child.data.hProperties["data-editorial-image-width"] = width;
            }
          }
        }
        visit(child);
      }
    };
    visit(tree);
  };
}

/** Replace TikZ fences with a safe placeholder for the editor-side hydrator. */
export function remarkArticleTikzPlaceholder() {
  return (tree) => {
    const visit = (node) => {
      if (!Array.isArray(node?.children)) return;
      for (const child of node.children) {
        if (
          child?.type === "code" &&
          String(child.lang ?? "").toLowerCase() === "tikz"
        ) {
          child.type = "html";
          child.value = `<div class="tikz-diagram tikz-diagram-pending" data-tikz-source="${tikzAttribute(child.value)}"><span>TikZをSVG化しています…</span></div>`;
          delete child.lang;
          delete child.meta;
        } else {
          visit(child);
        }
      }
    };
    visit(tree);
  };
}

/** Render exactly the same server SVG used by the published build. */
export async function hydrateTikzDiagrams(target, options = {}) {
  const endpoint = options.endpoint ?? "/api/admin/editor/tikz/render";
  const isCurrent =
    typeof options.isCurrent === "function" ? options.isCurrent : () => true;
  const nodes = [...target.querySelectorAll("[data-tikz-source]")];
  await Promise.all(
    nodes.map(async (node) => {
      if (!isCurrent() || !node.isConnected) return;
      const source = decodeURIComponent(
        node.getAttribute("data-tikz-source") ?? "",
      );
      try {
        const svg = await renderTikzPreviewSvg(source, endpoint);
        if (!isCurrent() || !node.isConnected) return;
        node.classList.remove("tikz-diagram-pending");
        node.removeAttribute("data-tikz-source");
        node.replaceChildren();
        node.insertAdjacentHTML("beforeend", svg);
      } catch (error) {
        if (!isCurrent() || !node.isConnected) return;
        node.classList.remove("tikz-diagram-pending");
        node.classList.add("tikz-diagram-failed");
        node.textContent =
          error instanceof Error
            ? error.message
            : "TikZを描画できませんでした。対応するコマンドやライブラリを確認してください。";
      }
    }),
  );
}

async function renderTikzPreviewSvg(source, endpoint) {
  const key = `${endpoint}\u0000${source}`;
  if (tikzSvgCache.has(key)) return tikzSvgCache.get(key);
  const running = tikzRenderPromises.get(key);
  if (running) return running;

  const promise = (async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok && typeof payload.svg === "string") {
          tikzSvgCache.set(key, payload.svg);
          return payload.svg;
        }
        // 4xxは入力エラーなので再試行せず、ブラウザ側へ切り替える。
        if (response.status >= 400 && response.status < 500) break;
      } catch {}
      if (attempt === 0)
        await new Promise((resolve) =>
          window.setTimeout(resolve, TIKZ_RETRY_DELAY_MS),
        );
    }

    try {
      assertSafeTikzSource(source);
      let fallbackError;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const svg = await renderWithFreeTikzJax(source);
          tikzSvgCache.set(key, svg);
          return svg;
        } catch (error) {
          fallbackError = error;
          // タイムアウトは同じブラウザ組版を繰り返して待ち時間を
          // 倍増させない。一時的な読み込み失敗だけ短く再試行する。
          if (error?.code === "TIKZ_TIMEOUT" || attempt === 1) break;
          await new Promise((resolve) =>
            window.setTimeout(resolve, TIKZ_RETRY_DELAY_MS),
          );
        }
      }
      throw fallbackError ?? new Error("TikZJaxで描画できませんでした。");
    } catch (fallbackError) {
      // 503の詳細を重ねず、執筆者が次に確認すべき内容を1つの通知にする。
      const message =
        fallbackError instanceof Error
          ? fallbackError.message
          : "無料プレビュー用TikZJaxを読み込めませんでした。";
      throw new Error(
        `${message} 対応外のコマンド・ライブラリ、またはネットワーク障害の可能性があります。`,
      );
    }
  })().finally(() => tikzRenderPromises.delete(key));
  tikzRenderPromises.set(key, promise);
  return promise;
}

function renderWithFreeTikzJax(source) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.title = "TikZ preview renderer";
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText =
      "position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;border:0;visibility:hidden";
    const safeSource = escapeTikzScriptSource(source);
    const scriptClose = "</" + "script>";
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${TIKZJAX_FONT_URL}"><script src="${TIKZJAX_SCRIPT_URL}">${scriptClose}</head><body><script type="text/tikz">${safeSource}${scriptClose}</body></html>`;
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      frame.remove();
      callback();
    };
    const check = () => {
      const svg = frame.contentDocument?.querySelector("svg");
      if (!svg) return;
      finish(() => resolve(embedTikzFontCss(svg.outerHTML)));
    };
    const poll = window.setInterval(check, 100);
    const timeout = window.setTimeout(
      () =>
        finish(() => {
          const error = new Error(
            "TikZJaxの初回描画がタイムアウトしました。しばらく待ってから再表示してください。",
          );
          error.code = "TIKZ_TIMEOUT";
          reject(error);
        }),
      TIKZ_FREE_RENDER_TIMEOUT_MS,
    );
    frame.addEventListener("load", check, { once: false });
    document.body.append(frame);
  });
}

function escapeTikzScriptSource(value) {
  return String(value ?? "").replace(/<\/script/gi, "<\\/script");
}

/**
 * Browser counterpart of the Astro Markdown pipeline.
 * Keep the editor preview on the same remark/rehype path as published pages;
 * editor-only asset hydration and statement numbering happen afterwards.
 */
export async function renderArticleMarkdown(
  source,
  { customPresets = {}, katex = true } = {},
) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkSmartypants)
    .use(remarkArticleDirectives)
    .use(remarkMath)
    .use(remarkJapaneseStrong)
    .use(remarkArticleMathMacros, customPresets)
    .use(remarkBrowserEditorialAssets)
    .use(remarkArticleTikzPlaceholder)
    .use(remarkRehype, { allowDangerousHtml: true });
  if (katex) processor.use(rehypeArticleKatex);
  processor.use(rehypeRaw).use(rehypeStringify, { allowDangerousHtml: true });
  const file = await processor.process(String(source ?? ""));
  return String(file);
}
