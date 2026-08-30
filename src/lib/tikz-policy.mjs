/**
 * TikZ/TeX input accepted by the server-side renderer.
 *
 * Keep this file free of Node-only imports: the admin Worker and the Node
 * renderer both use the same policy when they expose package choices.
 */
// Keep the editor and public build limits aligned. The renderer still rejects
// external I/O and shell execution below, so a larger authoring budget does
// not turn TikZ into an unbounded TeX input surface.
export const TIKZ_MAX_SOURCE_LENGTH = 64_000;
export const TIKZ_MAX_PACKAGE_COUNT = 8;
export const TIKZ_MAX_LIBRARY_COUNT = 24;
// Large diagrams can contain many paths and embedded font references. Keep a
// bounded response for safety, while allowing the larger figures used in the
// editor to finish SVG conversion instead of falling back with a size error.
export const TIKZ_MAX_RENDERED_SVG_LENGTH = 4_000_000;

// These are included in node-tikzjax's TeX bundle. `tikz` itself is supplied
// by the renderer's standalone preamble and is therefore not selectable.
export const ALLOWED_TIKZ_PACKAGES = Object.freeze([
  "amsmath",
  "amstext",
  "amsfonts",
  "amssymb",
  "array",
  "chemfig",
  "circuitikz",
  "pgfplots",
  "tikz-3dplot",
  "tikz-cd",
]);

// Standard TikZ libraries shipped with the bundled PGF installation.
export const ALLOWED_TIKZ_LIBRARIES = Object.freeze([
  "3d",
  "angles",
  "arrows",
  "arrows.meta",
  "automata",
  "backgrounds",
  "calc",
  "chains",
  "decorations.markings",
  "decorations.pathmorphing",
  "decorations.pathreplacing",
  "fit",
  "intersections",
  "matrix",
  "patterns",
  "petri",
  "positioning",
  "quotes",
  "scopes",
  "shadings",
  "shapes.arrows",
  "shapes.geometric",
  "shapes.misc",
  "spy",
  "trees",
]);

export const TIKZ_DANGEROUS_COMMAND_PATTERN =
  /\\(?:input|include|openin|openout|write18|directlua|latelua|read|write|catcode|special|pdfobj|immediate)\b|(?:https?:|file:|data:)/i;

// The bundled TeX engine has no CJK input/font package. Mask authored
// Unicode before TeX sees it, then restore it in generated SVG text nodes.
export function maskTikzUnicode(source) {
  const replacements = [];
  const masked = String(source ?? "").replace(/[^\x00-\x7F]+/gu, (value) => {
    const token = `ATLASEZUNICODE${replacements.length}X`;
    replacements.push([token, value]);
    return token;
  });
  return { source: masked, replacements };
}

export function restoreTikzUnicode(svg, replacements = []) {
  let value = String(svg ?? "");
  for (const [token, original] of replacements) {
    const pattern = token
      .split("")
      .map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("(?:</text><text[^>]*>)?");
    value = value.replace(new RegExp(pattern, "g"), () => original);
  }
  return value;
}

/**
 * node-tikzjax/TikZJax's TeX-to-SVG font encoding can emit the ordinary math
 * slash as the glyph text `=`.  `\\left/\\right.` selects the slash glyph
 * through the delimiter path and survives both renderers.  Apply this only
 * to math text (including tikzcd cells, which are implicitly math mode), so
 * coordinate/path syntax outside math is not changed.
 */
export function normalizeTikzMathSlashes(source) {
  const replaceInMath = (value) => {
    let result = "";
    for (let index = 0; index < value.length; index += 1) {
      if (
        value[index] === "/" &&
        value[index - 1] !== "\\" &&
        !value.slice(Math.max(0, index - 6), index).includes("\\left")
      ) {
        result += "\\left/\\right.";
      } else {
        result += value[index];
      }
    }
    return result;
  };
  let value = String(source ?? "");
  // tikzcd cells are math mode without explicit `$...$` delimiters.
  value = value.replace(
    /(\\begin\{tikzcd\})([\s\S]*?)(\\end\{tikzcd\})/gi,
    (_, open, body, close) => `${open}${replaceInMath(body)}${close}`,
  );
  // Also cover ordinary TikZ nodes written with explicit math delimiters.
  return value.replace(
    /(\$+)([\s\S]*?)\1/g,
    (_, delimiter, body) => `${delimiter}${replaceInMath(body)}${delimiter}`,
  );
}

/** Make TikZ labels use the same KaTeX family as surrounding article math. */
export function normalizeTikzSvgFonts(svg) {
  return String(svg ?? "")
    .replace(/font-family\s*:\s*cmmi(\d+)/gi, "font-family: KaTeX_Math, cmmi$1")
    .replace(
      /font-family\s*=\s*(["'])cmmi(\d+)\1/gi,
      'font-family="KaTeX_Math, cmmi$2"',
    )
    .replace(/font-family\s*:\s*cmr(\d+)/gi, "font-family: KaTeX_Main, cmr$1")
    .replace(
      /font-family\s*=\s*(["'])cmr(\d+)\1/gi,
      'font-family="KaTeX_Main, cmr$2"',
    );
}

const safeName = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const safeOption = /^[A-Za-z0-9_.,=+*\-\s]*$/;

export function normalizeTikzPackages(value) {
  const entries = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const allowed = new Set(ALLOWED_TIKZ_PACKAGES);
  const packages = [];
  for (const entry of entries) {
    const raw = typeof entry === "string" ? entry.trim() : "";
    if (!raw) continue;
    const [name, options = ""] = raw.split(":", 2);
    if (
      !safeName.test(name) ||
      !allowed.has(name) ||
      !safeOption.test(options)
    ) {
      throw new Error(`許可されていないTikZパッケージです: ${name || raw}`);
    }
    if (!packages.some((item) => item.name === name))
      packages.push({ name, options });
  }
  if (packages.length > TIKZ_MAX_PACKAGE_COUNT)
    throw new Error(`TikZパッケージは${TIKZ_MAX_PACKAGE_COUNT}個までです。`);
  return packages;
}

export function normalizeTikzLibraries(value) {
  const entries = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const allowed = new Set(ALLOWED_TIKZ_LIBRARIES);
  const libraries = [];
  for (const entry of entries) {
    const name = typeof entry === "string" ? entry.trim() : "";
    if (!name) continue;
    if (!safeName.test(name) || !allowed.has(name))
      throw new Error(`許可されていないTikZライブラリです: ${name}`);
    if (!libraries.includes(name)) libraries.push(name);
  }
  if (libraries.length > TIKZ_MAX_LIBRARY_COUNT)
    throw new Error(`TikZライブラリは${TIKZ_MAX_LIBRARY_COUNT}個までです。`);
  return libraries;
}

export function assertSafeTikzSource(source) {
  const value = String(source ?? "");
  if (!value.trim()) throw new Error("TikZソースが空です。");
  if (value.length > TIKZ_MAX_SOURCE_LENGTH)
    throw new Error(
      `TikZソースは${TIKZ_MAX_SOURCE_LENGTH.toLocaleString()}文字以内です。`,
    );
  if (TIKZ_DANGEROUS_COMMAND_PATTERN.test(value))
    throw new Error(
      "外部ファイル読み込みやシェル実行を含むTikZソースは利用できません。",
    );
  if (
    /\\(?:documentclass|begin\s*\{document\}|end\s*\{document\})/i.test(value)
  )
    throw new Error(
      "TikZブロック内にdocument環境やdocumentclassは書けません。",
    );
  return value;
}

export function tikzPackageHelp() {
  return {
    packages: [...ALLOWED_TIKZ_PACKAGES],
    libraries: [...ALLOWED_TIKZ_LIBRARIES],
    limits: {
      maxSourceLength: TIKZ_MAX_SOURCE_LENGTH,
      maxPackageCount: TIKZ_MAX_PACKAGE_COUNT,
      maxLibraryCount: TIKZ_MAX_LIBRARY_COUNT,
    },
  };
}
