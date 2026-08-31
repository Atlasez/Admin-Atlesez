import * as katex from "katex";

const INLINE_MATH = /\$(?!\$)([^$\n]+?)\$(?!\$)/g;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderArticleTitleMath(source, macros = {}) {
  const value = String(source ?? "");
  if (!INLINE_MATH.test(value)) {
    INLINE_MATH.lastIndex = 0;
    return escapeHtml(value);
  }
  INLINE_MATH.lastIndex = 0;
  let cursor = 0;
  let html = "";
  for (const match of value.matchAll(INLINE_MATH)) {
    const index = match.index ?? 0;
    html += escapeHtml(value.slice(cursor, index));
    html += katex.renderToString(match[1], {
      displayMode: false,
      macros,
      strict: "warn",
      throwOnError: false,
    });
    cursor = index + match[0].length;
  }
  return html + escapeHtml(value.slice(cursor));
}

export function articleTitleContainsMath(source) {
  INLINE_MATH.lastIndex = 0;
  const result = INLINE_MATH.test(String(source ?? ""));
  INLINE_MATH.lastIndex = 0;
  return result;
}
