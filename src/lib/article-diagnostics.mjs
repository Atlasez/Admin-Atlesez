const DIRECTIVE_MARKER =
  /^\s*(:{3,4})\s*([A-Za-z][A-Za-z0-9_-]*)(?:\s+(.+?))?\s*$/;
const DIRECTIVE_CLOSE = /^\s*(:{3,4})\s*$/;
const STATEMENT_ID = /\s*\{#([A-Za-z][A-Za-z0-9_-]*)\}\s*$/;
const REF_PATTERN = /\[\[ref:([A-Za-z][A-Za-z0-9_-]*)\]\]/g;
const CITE_PATTERN = /\[\[cite:([A-Za-z0-9][A-Za-z0-9_-]*)\]\]/g;
const MACRO_PATTERN =
  /\\(?:newcommand|renewcommand|providecommand|DeclareMathOperator)\*?\s*(?:\{)?(\\[A-Za-z][A-Za-z0-9]*)/g;

const diagnostic = (severity, code, message, line, column = 1) => ({
  severity,
  code,
  message,
  line,
  column,
});

/** Return source diagnostics suitable for a compact editor panel. */
/** @param {string} source @param {{references?: Array<{id?: string}>; externalReferenceIds?: string[]}} [options] */
export function diagnoseArticleSource(
  source,
  { references = [], externalReferenceIds = [] } = {},
) {
  const text = String(source ?? "");
  const lines = text.split(/\r?\n/);
  const diagnostics = [];
  const directiveStack = [];
  const statementIds = new Map();
  const macroDefinitions = new Map();
  const externalIds = new Set(
    externalReferenceIds.map((id) => String(id).toLowerCase()),
  );
  const referenceIds = new Set(
    references.map((item) => String(item?.id ?? "").toLowerCase()),
  );
  let codeFence = false;
  let displayMathLine = 0;
  let inlineMathLine = 0;

  const add = (severity, code, message, line, column = 1) => {
    diagnostics.push(diagnostic(severity, code, message, line, column));
  };

  lines.forEach((line, lineIndex) => {
    const lineNumber = lineIndex + 1;
    if (/^\s*```/.test(line)) {
      codeFence = !codeFence;
      return;
    }
    if (codeFence) return;

    const close = DIRECTIVE_CLOSE.exec(line);
    if (close) {
      if (!directiveStack.length)
        add(
          "error",
          "directive-unmatched-close",
          "対応する命題・証明枠の開始がありません。",
          lineNumber,
          close.index + 1,
        );
      else if (close[1].length < directiveStack.at(-1).fence)
        add(
          "error",
          "directive-fence-mismatch",
          "命題・証明枠の閉じ記法（コロンの数）が一致していません。",
          lineNumber,
          close.index + 1,
        );
      else directiveStack.pop();
    } else {
      const marker = DIRECTIVE_MARKER.exec(line);
      if (marker) {
        directiveStack.push({ fence: marker[1].length, line: lineNumber });
        const id = STATEMENT_ID.exec(marker[3] ?? "")?.[1];
        if (id) {
          const previous = statementIds.get(id.toLowerCase());
          if (previous)
            add(
              "error",
              "duplicate-statement-id",
              `識別子「${id}」が重複しています（${previous}行目）。`,
              lineNumber,
              line.indexOf("{#") + 1,
            );
          else statementIds.set(id.toLowerCase(), lineNumber);
        }
      }
    }

    let index = 0;
    while (index < line.length) {
      if (
        line.startsWith("$$", index) &&
        (index === 0 || line[index - 1] !== "\\")
      ) {
        if (displayMathLine) displayMathLine = 0;
        else displayMathLine = lineNumber;
        index += 2;
        continue;
      }
      if (
        !displayMathLine &&
        line[index] === "$" &&
        (index === 0 || line[index - 1] !== "\\")
      ) {
        if (inlineMathLine) inlineMathLine = 0;
        else inlineMathLine = lineNumber;
      }
      index += 1;
    }

    for (const match of line.matchAll(MACRO_PATTERN)) {
      const name = match[1];
      const previous = macroDefinitions.get(name);
      if (previous)
        add(
          "warning",
          "duplicate-macro",
          `マクロ「${name}」が重複定義されています（${previous}行目）。`,
          lineNumber,
          (match.index ?? 0) + 1,
        );
      else macroDefinitions.set(name, lineNumber);
    }
  });

  if (codeFence)
    add(
      "error",
      "code-unclosed",
      "コードブロックが閉じられていません。``` を追加してください。",
      lines.length,
    );
  if (displayMathLine)
    add(
      "error",
      "display-math-unclosed",
      "表示数式の $$ が閉じられていません。",
      displayMathLine,
    );
  if (inlineMathLine)
    add(
      "error",
      "inline-math-unclosed",
      "インライン数式の $ が閉じられていません。",
      inlineMathLine,
    );
  for (const open of directiveStack)
    add(
      "error",
      "directive-unclosed",
      `命題・証明枠が閉じられていません（${open.line}行目から）。`,
      open.line,
    );

  for (const [lineIndex, line] of lines.entries()) {
    if (/^\s*```/.test(line)) continue;
    for (const match of line.matchAll(REF_PATTERN)) {
      const id = match[1].toLowerCase();
      if (!statementIds.has(id) && !externalIds.has(id))
        add(
          "warning",
          "unresolved-reference",
          `参照「${match[1]}」をこの記事または公開済み記事から解決できません。`,
          lineIndex + 1,
          (match.index ?? 0) + 1,
        );
    }
    for (const match of line.matchAll(CITE_PATTERN)) {
      if (!referenceIds.has(match[1].toLowerCase()))
        add(
          "warning",
          "unresolved-citation",
          `参考文献「${match[1]}」が記事の参考文献リストにありません。`,
          lineIndex + 1,
          (match.index ?? 0) + 1,
        );
    }
  }
  return diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
}
