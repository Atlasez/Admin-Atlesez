import { createHash } from "node:crypto";
import tikzjax from "node-tikzjax";
import {
  TIKZ_MAX_RENDERED_SVG_LENGTH,
  assertSafeTikzSource,
  normalizeTikzLibraries,
  normalizeTikzPackages,
} from "./tikz-policy.mjs";

const tex2svg =
  typeof tikzjax === "function"
    ? tikzjax
    : tikzjax?.default ?? tikzjax?.default?.default;
if (typeof tex2svg !== "function")
  throw new Error("node-tikzjaxのレンダラーを読み込めませんでした。");

// node-tikzjax uses a shared in-memory TeX filesystem and its own global
// WASM state. Serialize renders so two requests cannot corrupt one another.
let renderQueue = Promise.resolve();

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function extractDeclarations(source) {
  let body = source;
  const packages = [];
  const libraries = [];
  body = body.replace(
    /\\usepackage(?:\[([^\]\r\n]*)\])?\{([^}\r\n]+)\}/gi,
    (_, options = "", names) => {
      for (const name of names.split(",")) packages.push(`${name.trim()}:${options}`);
      return "";
    },
  );
  body = body.replace(/\\usetikzlibrary\{([^}\r\n]+)\}/gi, (_, names) => {
    libraries.push(...names.split(",").map((name) => name.trim()));
    return "";
  });
  return { body, packages, libraries };
}

function normalizeSource(source, packages, libraries) {
  const checked = assertSafeTikzSource(source);
  const declarations = extractDeclarations(checked);
  const packageList = normalizeTikzPackages([
    ...declarations.packages,
    ...packages,
  ]);
  const libraryList = normalizeTikzLibraries([
    ...declarations.libraries,
    ...libraries,
  ]);
  return {
    body: declarations.body.trim(),
    packages: packageList,
    libraries: libraryList,
  };
}

function sanitizeRenderedSvg(svg) {
  const value = String(svg ?? "").trim();
  if (!/^<svg(?:\s|>)/i.test(value) || value.length > TIKZ_MAX_RENDERED_SVG_LENGTH)
    throw new Error("生成されたSVGが不正または大きすぎます。");
  if (/<(?:script|foreignObject|iframe|object|embed)\b|\bon[a-z][a-z0-9_-]*\s*=|(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|javascript:)/i.test(value))
    throw new Error("安全でないSVGを生成したため表示を中止しました。");
  return value;
}

export async function renderTikzSource(source, options = {}) {
  const normalized = normalizeSource(
    source,
    options.packages ?? [],
    options.libraries ?? [],
  );
  const render = async () => {
    const texPackages = Object.fromEntries(
      normalized.packages.map(({ name, options: packageOptions }) => [name, packageOptions]),
    );
    // The bundled e-TeX format already preloads the TikZ base. In this
    // package version adding a documentclass causes the format to fail, so
    // use the same minimal document wrapper as the upstream examples.
    const tex = `\\begin{document}${normalized.body}\\end{document}`;
    const svg = await tex2svg(tex, {
      texPackages,
      tikzLibraries: normalized.libraries.join(","),
      disableOptimize: false,
    });
    return {
      svg: sanitizeRenderedSvg(svg),
      hash: createHash("sha256")
        .update(JSON.stringify({ source: normalized.body, packages: normalized.packages, libraries: normalized.libraries }))
        .digest("hex"),
      packages: normalized.packages,
      libraries: normalized.libraries,
    };
  };
  const result = renderQueue.then(render, render);
  renderQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function tikzErrorHtml(error) {
  const message = error instanceof Error ? error.message : "TikZをSVGに変換できませんでした。";
  return `<div class="tikz-error" role="img" aria-label="TikZエラー"><strong>TikZを描画できませんでした</strong><span>${escapeHtml(message)}</span></div>`;
}

export function tikzSvgHtml(result) {
  return `<div class="tikz-diagram" data-tikz-hash="${escapeHtml(result.hash)}">${result.svg}</div>`;
}
