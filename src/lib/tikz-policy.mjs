/**
 * TikZ/TeX input accepted by the server-side renderer.
 *
 * Keep this file free of Node-only imports: the admin Worker and the Node
 * renderer both use the same policy when they expose package choices.
 */
export const TIKZ_MAX_SOURCE_LENGTH = 24_000;
export const TIKZ_MAX_PACKAGE_COUNT = 8;
export const TIKZ_MAX_LIBRARY_COUNT = 24;
export const TIKZ_MAX_RENDERED_SVG_LENGTH = 1_500_000;

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
